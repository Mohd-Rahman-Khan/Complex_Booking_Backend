const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const bookingController = require("../controllers/bookingController");

// Authentication required
router.use(authMiddleware);

// Get customer bookings
router.get("/my-bookings", bookingController.getMyBookings);

// Get all admin complex bookings
router.get("/admin/bookings", bookingController.getAdminBookings);

// Calculate booking price
router.post("/price-preview", bookingController.pricePreview);

// Create confirmed booking
router.post("/", bookingController.createBooking);

// Cancel booking
router.patch("/:bookingId/cancel", bookingController.cancelBooking);

module.exports = router;
