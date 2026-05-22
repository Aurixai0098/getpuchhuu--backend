// src/socket/socketManager.js
const User = require('../models/User');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const Chat = require('../models/Chat');
const LocationTracking = require('../models/LocationTracking');

const userSockets = new Map();   // userId -> Set of socket IDs
const providerSockets = new Map(); // provider userId -> socket.id
const onlineUsers = new Map();    // userId -> Set(socket.id)

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('register', async (data) => {
      const { userId, role } = data;
      if (!userId) return;

      const uid = userId.toString();
      socket.join(`user_${uid}`);
      if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
      onlineUsers.get(uid).add(socket.id);

      if (role === 'provider') {
        providerSockets.set(uid, socket.id);
        socket.join(`provider_${uid}`);
      }

      socket.userId = userId;
      socket.role = role;

      io.to(`user_${uid}`).emit('user-online', { userId: uid, role });
      console.log(`✅ User ${uid} registered as ${role}`);
    });

    socket.on('typing-start', async (data) => {
      const { bookingId } = data;
      if (!socket.userId || !bookingId) return;
      try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return;
        let receiverRoom = null;
        if (socket.role === 'customer') {
          const provider = await ServiceProvider.findById(booking.provider).populate('user');
          if (provider && provider.user) receiverRoom = provider.user._id.toString();
        } else {
          receiverRoom = booking.customer.toString();
        }
        if (receiverRoom) {
          io.to(`user_${receiverRoom}`).emit('typing', { bookingId, userId: socket.userId });
        }
      } catch (err) {
        console.error('typing-start error:', err);
      }
    });

    socket.on('typing-stop', async (data) => {
      const { bookingId } = data;
      if (!socket.userId || !bookingId) return;
      try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return;
        let receiverRoom = null;
        if (socket.role === 'customer') {
          const provider = await ServiceProvider.findById(booking.provider).populate('user');
          if (provider && provider.user) receiverRoom = provider.user._id.toString();
        } else {
          receiverRoom = booking.customer.toString();
        }
        if (receiverRoom) {
          io.to(`user_${receiverRoom}`).emit('typing-stop', { bookingId, userId: socket.userId });
        }
      } catch (err) {
        console.error('typing-stop error:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
      if (socket.userId) {
        const uid = socket.userId.toString();
        if (onlineUsers.has(uid)) {
          onlineUsers.get(uid).delete(socket.id);
          if (onlineUsers.get(uid).size === 0) {
            onlineUsers.delete(uid);
            io.to(`user_${uid}`).emit('user-offline', { userId: uid, role: socket.role });
          }
        }
        if (socket.role === 'provider') {
          providerSockets.delete(uid);
        }
      }
    });

    socket.on('accept-booking', async (data) => {
      const { bookingId, providerId } = data;
      try {
        const booking = await Booking.findById(bookingId).populate('customer provider');
        if (!booking) return socket.emit('error', { message: 'Booking not found' });
        if (booking.status !== 'pending' && booking.status !== 'searching') {
          return socket.emit('error', { message: 'Booking already accepted or expired' });
        }
        booking.provider = providerId;
        booking.status = 'confirmed';
        booking.acceptedAt = new Date();
        await booking.save();

        const provider = await ServiceProvider.findById(providerId).populate('user', 'firstName lastName phone avatar');
        if (!provider) throw new Error('Provider not found');

        io.to(`user_${booking.customer._id.toString()}`).emit('booking-accepted', {
          bookingId: booking._id,
          provider: {
            id: provider._id,
            businessName: provider.businessName,
            phone: provider.user?.phone,
            avatar: provider.user?.avatar?.url,
            name: `${provider.user?.firstName} ${provider.user?.lastName}`,
          },
        });

        socket.emit('accept-success', { bookingId, status: 'confirmed' });

        for (const [provUserId, sockId] of providerSockets.entries()) {
          if (provUserId !== providerId.toString()) {
            io.to(sockId).emit('booking-taken', { bookingId });
          }
        }
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('update-location', async (data) => {
      const { bookingId, lat, lng } = data;
      const providerUserId = socket.userId;
      if (!providerUserId) return;
      try {
        const provider = await ServiceProvider.findOne({ user: providerUserId });
        if (!provider) return;
        await LocationTracking.create({
          booking: bookingId,
          provider: provider._id,
          location: { type: 'Point', coordinates: [lng, lat] },
          timestamp: new Date(),
        });
        const booking = await Booking.findById(bookingId);
        if (booking) {
          io.to(`user_${booking.customer.toString()}`).emit('provider-location-update', {
            bookingId, lat, lng, timestamp: new Date(),
          });
        }
      } catch (err) {
        console.error(err);
      }
    });

    // ---------- FIXED SEND-MESSAGE (handles pending bookings) ----------
    socket.on('send-message', async (data) => {
      const { bookingId, message, senderId, senderRole, type = 'text', imageUrl } = data;
      if (!message && !imageUrl) return;
      try {
        const chatData = {
          booking: bookingId,
          sender: senderId,
          senderRole,
          message: type === 'image' ? (message || 'Image') : message.trim(),
          type,
          imageUrl: imageUrl || null,
        };
        const chat = await Chat.create(chatData);

        const booking = await Booking.findById(bookingId);
        if (!booking) return;

        let receiverId = null;
        if (senderRole === 'customer') {
          // Agar provider assigned hai to use karo, warna customer ko hi bata do ki koi reply nahi milega
          if (booking.provider) {
            const provider = await ServiceProvider.findById(booking.provider).populate('user');
            if (provider && provider.user) receiverId = provider.user._id;
          }
          // Agar provider nahi hai to message store ho jayega, par abhi real-time nahi bhej sakte
        } else {
          receiverId = booking.customer;
        }

        if (receiverId) {
          io.to(`user_${receiverId.toString()}`).emit('new-message', {
            bookingId,
            message: chat.message,
            senderId,
            senderRole,
            createdAt: chat.createdAt,
            chatId: chat._id,
            type: chat.type,
            imageUrl: chat.imageUrl,
          });
        }

        socket.emit('message-sent', chat);
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('check-user-online', (userId) => {
      const isOnline = onlineUsers.has(userId.toString());
      socket.emit('user-online-status', { userId, isOnline });
    });
  });
};