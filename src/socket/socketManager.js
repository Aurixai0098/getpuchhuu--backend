// src/socket/socketManager.js
const User = require('../models/User');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const Chat = require('../models/Chat');
const LocationTracking = require('../models/LocationTracking');

const userSockets = new Map();
const providerSockets = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('register', async (data) => {
      const { userId, role } = data;
      if (userId) {
        if (role === 'provider') {
          providerSockets.set(userId, socket.id);
          socket.join(`provider_${userId}`);
          console.log(`✅ Provider ${userId} registered`);
        } else {
          userSockets.set(userId, socket.id);
          socket.join(`user_${userId}`);
          console.log(`✅ User ${userId} registered`);
        }
        socket.userId = userId;
        socket.role = role;
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

        const userSocketId = userSockets.get(booking.customer._id.toString());
        if (userSocketId) {
          io.to(userSocketId).emit('booking-accepted', {
            bookingId: booking._id,
            provider: {
              id: provider._id,
              businessName: provider.businessName,
              phone: provider.user?.phone,
              avatar: provider.user?.avatar?.url,
              name: `${provider.user?.firstName} ${provider.user?.lastName}`,
            },
          });
        }
        socket.emit('accept-success', { bookingId, status: 'confirmed' });
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
          const userSocketId = userSockets.get(booking.customer.toString());
          if (userSocketId) {
            io.to(userSocketId).emit('provider-location-update', {
              bookingId, lat, lng, timestamp: new Date(),
            });
          }
        }
      } catch (err) {
        console.error(err);
      }
    });

    socket.on('send-message', async (data) => {
      const { bookingId, message, senderId, senderRole } = data;
      if (!message || !message.trim()) return;
      try {
        const chat = await Chat.create({
          booking: bookingId,
          sender: senderId,
          senderRole,
          message: message.trim(),
        });
        const booking = await Booking.findById(bookingId);
        if (!booking) return;
        let receiverId = null;
        if (senderRole === 'customer') {
          const provider = await ServiceProvider.findById(booking.provider).populate('user');
          if (provider && provider.user) receiverId = provider.user._id;
        } else {
          receiverId = booking.customer;
        }
        const receiverSocketId = userSockets.get(receiverId?.toString());
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('new-message', {
            bookingId,
            message: chat.message,
            senderId,
            senderRole,
            createdAt: chat.createdAt,
            chatId: chat._id,
          });
        }
        socket.emit('message-sent', chat);
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
      if (socket.userId) {
        if (socket.role === 'provider') providerSockets.delete(socket.userId);
        else userSockets.delete(socket.userId);
      }
    });
  });
};