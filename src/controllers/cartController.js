// controllers/cartController.js
const Cart = require('../models/Cart');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// Get user's cart
exports.getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [] });
  }
  new ApiResponse(200, { cart }, 'Cart fetched').send(res);
});

// Add/update item in cart (full replace)
exports.updateCart = asyncHandler(async (req, res) => {
  const { items } = req.body; // items is array of cart items (full replacement)
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items });
  } else {
    cart.items = items;
    cart.updatedAt = new Date();
    await cart.save();
  }
  new ApiResponse(200, { cart }, 'Cart updated').send(res);
});

// Clear cart
exports.clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate(
    { user: req.user._id },
    { items: [], updatedAt: new Date() },
    { upsert: true }
  );
  new ApiResponse(200, null, 'Cart cleared').send(res);
});