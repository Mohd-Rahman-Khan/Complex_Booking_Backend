const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const generateToken = require("../utils/generateToken");

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES || 5);
const MAX_OTP_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

// COMMON REQUEST OTP
// Customer, Complex Admin, Sport Admin
exports.requestOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\+?[0-9]{10,15}$/.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Valid mobile number is required",
      });
    }

    const normalizedPhone = phone.trim();

    let user = await User.findOne({ phone: normalizedPhone });

    // Only customers can register automatically.
    // Admin accounts must already exist.
    if (!user) {
      user = await User.create({
        name: "Customer",
        phone: normalizedPhone,
        role: "customer",
        isActive: true,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const otp =
      process.env.OTP_MODE === "development"
        ? "123456"
        : crypto.randomInt(100000, 1000000).toString();

    user.otpHash = await bcrypt.hash(otp, 10);
    user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.otpAttempts = 0;
    user.otpBlockedUntil = null;

    await user.save();

    // Integrate SMS provider here for production.
    if (process.env.OTP_MODE === "development") {
      console.log(`SportsArena OTP for ${normalizedPhone}: ${otp}`);
    }

    const data = {
      phone: normalizedPhone,
      expiresIn: OTP_EXPIRY_MINUTES * 60,
    };

    if (
      process.env.NODE_ENV === "development" &&
      process.env.OTP_MODE === "development"
    ) {
      data.devOtp = otp;
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data,
    });
  } catch (error) {
    console.error("Request OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send OTP",
    });
  }
};

// COMMON VERIFY OTP
// Customer, Complex Admin, Sport Admin
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (
      !phone ||
      !otp ||
      !/^\+?[0-9]{10,15}$/.test(phone.trim()) ||
      !/^[0-9]{6}$/.test(String(otp))
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid phone number and 6-digit OTP are required",
      });
    }

    const user = await User.findOne({
      phone: phone.trim(),
    }).select("+otpHash +otpExpiresAt +otpAttempts +otpBlockedUntil");

    if (!user || !user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new OTP",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    if (user.otpBlockedUntil && user.otpBlockedUntil > new Date()) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Try again after 15 minutes",
      });
    }

    if (user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP",
      });
    }

    const isOtpValid = await bcrypt.compare(String(otp), user.otpHash);

    if (!isOtpValid) {
      const attempts = (user.otpAttempts || 0) + 1;

      user.otpAttempts = attempts;

      if (attempts >= MAX_OTP_ATTEMPTS) {
        user.otpBlockedUntil = new Date(Date.now() + BLOCK_MINUTES * 60 * 1000);
      }

      await user.save();

      return res.status(400).json({
        success: false,
        message:
          attempts >= MAX_OTP_ATTEMPTS
            ? "Too many incorrect attempts. Try again after 15 minutes"
            : "Invalid OTP",
        remainingAttempts: Math.max(0, MAX_OTP_ATTEMPTS - attempts),
      });
    }

    // Clear OTP after successful verification.
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    user.otpBlockedUntil = null;
    user.isPhoneVerified = true;
    user.lastLoginAt = new Date();

    await user.save();

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          complexId: user.complexId || null,
          profileImage: user.profileImage || null,
        },
      },
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};

// GET LOGGED-IN USER PROFILE
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-password -otpHash -otpExpiresAt -otpAttempts -otpBlockedUntil",
    );

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get profile",
    });
  }
};

// ADMIN REGISTRATION - SEPARATE API
exports.registerAdmin = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name?.trim() || !phone || !/^\+?[0-9]{10,15}$/.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Valid name and mobile number are required",
      });
    }

    const normalizedPhone = phone.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    const duplicateConditions = [{ phone: normalizedPhone }];

    if (normalizedEmail) {
      duplicateConditions.push({ email: normalizedEmail });
    }

    const existingUser = await User.findOne({
      $or: duplicateConditions,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "This mobile number or email is already registered",
      });
    }

    const user = await User.create({
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail || undefined,
      role: "complex_admin",
      complexId: null,
      isActive: true,
      isPhoneVerified: false,
    });

    return res.status(201).json({
      success: true,
      message:
        "Admin registered successfully. Please login using your mobile number.",
      data: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Admin registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to register admin",
    });
  }
};
