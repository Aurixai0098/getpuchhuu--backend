require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected.");

    const email = "admin@gharseva.com";
    const existing = await User.findOne({ email });

    if (existing) {
      console.log("Admin email already exists. No changes made.");
      return;
    }

    const firstName = await ask("First name: ");
    const lastName = await ask("Last name: ");
    const phone = await ask("10-digit mobile number: ");
    const password = await ask("New password (minimum 8 characters): ");

    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new Error("Enter a valid Indian 10-digit mobile number.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    await User.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      role: "admin",
      status: "active"
    });

    console.log("Admin account created successfully.");
    console.log("Login email: " + email);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    rl.close();
    await mongoose.disconnect().catch(() => {});
  }
}

main();