const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const bookingController = require("../controllers/bookingController");

router.use(authMiddleware);

router.post("/price-preview", bookingController.pricePreview);

router.post("/", bookingController.createBooking);

router.patch("/:bookingId/cancel", bookingController.cancelBooking);

module.exports = router;
