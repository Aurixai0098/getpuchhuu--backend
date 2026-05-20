// src/socket/socketManager.js
const User = require('../models/User');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const Chat = require('../models/Chat');
const LocationTracking = require('../models/LocationTracking');

const userSockets = new Map();   // userId -> socket.id (सिर्फ डिबगिंग के लिए)
const providerSockets = new Map(); // provider userId -> socket.id

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('register', async (data) => {
      const { userId, role } = data;
      if (userId) {
        const uid = userId.toString();

        // सभी यूज़र अपने कमरे में जुड़ें
        socket.join(`user_${uid}`);
        userSockets.set(uid, socket.id);

        if (role === 'provider') {
          providerSockets.set(uid, socket.id);
          socket.join(`provider_${uid}`);
        }

        socket.userId = userId;
        socket.role = role;
        console.log(`✅ User ${uid} registered as ${role}`);
      }
    });

    // ---------- बुकिंग स्वीकार ----------
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

        // ✅ कस्टमर के कमरे में भेजें (सभी टैब को मिलेगा)
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

        // दूसरे प्रोवाइडर्स को बताएं (room का इस्तेमाल नहीं, क्योंकि सिर्फ providerSockets से सीधे भेजना है)
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

    // ---------- लोकेशन अपडेट ----------
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
          // ✅ कस्टमर के कमरे में भेजें
          io.to(`user_${booking.customer.toString()}`).emit('provider-location-update', {
            bookingId, lat, lng, timestamp: new Date(),
          });
        }
      } catch (err) {
        console.error(err);
      }
    });

    // ---------- मैसेज भेजें ----------
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

        // रिसीवर का userId निकालें
        let receiverId = null;
        if (senderRole === 'customer') {
          const provider = await ServiceProvider.findById(booking.provider).populate('user');
          if (provider && provider.user) receiverId = provider.user._id;
        } else {
          receiverId = booking.customer;
        }

        // ✅ रिसीवर के कमरे में भेजें (सभी टैब को मिलेगा)
        if (receiverId) {
          io.to(`user_${receiverId.toString()}`).emit('new-message', {
            bookingId,
            message: chat.message,
            senderId,
            senderRole,
            createdAt: chat.createdAt,
            chatId: chat._id,
          });
        }

        // भेजने वाले को कन्फर्मेशन
        socket.emit('message-sent', chat);
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: err.message });
      }
    });

    // ---------- डिस्कनेक्ट ----------
    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
      if (socket.userId) {
        const uid = socket.userId.toString();
        userSockets.delete(uid);
        if (socket.role === 'provider') {
          providerSockets.delete(uid);
        }
      }
    });
  });
};