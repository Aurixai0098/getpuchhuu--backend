
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const User = require('./src/models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

async function createAdmin() {
  try {
    const email = (await ask('Admin email: ')).toLowerCase();
    const firstName = await ask('First name: ');
    const lastName = await ask('Last name: ');
    const phone = await ask('10-digit Indian mobile number: ');
    const password = await ask('New password (minimum 8 characters): ');

    if (!email || !firstName || !lastName) {
      throw new Error('Name and email are required.');
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new Error('Enter a valid 10-digit Indian mobile number.');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI missing in .env');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const existing = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existing) {
      throw new Error(
        'This email or phone already exists. Choose different details.'
      );
    }

    const admin = await User.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      role: 'admin',
      status: 'active',
      isEmailVerified: true,
      isPhoneVerified: true,
      gender: 'other'
    });

    console.log('\nAdmin account created successfully!');
    console.log('Email:', admin.email);
    console.log('Role:', admin.role);
    console.log('Now log in using your new credentials.');
  } catch (error) {
    console.error('\nFailed:', error.message);
  } finally {
    rl.close();
    await mongoose.disconnect().catch(() => {});
  }
}

createAdmin();
