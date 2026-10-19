require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

async function main() {
  const email = 'puchhuuaurixaisoftware01@gmail.com';

  const newPassword = process.env.NEW_ADMIN_PASSWORD;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing in .env');
  }

  if (!newPassword || newPassword.length < 8) {
    throw new Error('NEW_ADMIN_PASSWORD must be at least 8 characters');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    console.log('Admin email not found. No changes made.');
    return;
  }

  if (user.role !== 'admin') {
    console.log('Account is not an admin. No changes made.');
    return;
  }

  user.password = newPassword;
  await user.save();

  console.log('Admin password reset successfully.');
  console.log('Email:', user.email);
}

main()
  .catch(err => {
    console.error('Reset failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
