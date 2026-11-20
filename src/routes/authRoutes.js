const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

// Admin registration
router.post("/register-admin", authController.registerAdmin);

// Common login APIs
router.post("/request-otp", authController.requestOtp);
router.post("/verify-otp", authController.verifyOtp);

// Logged-in user
router.get("/me", authMiddleware, authController.getMe);

module.exports = router;
