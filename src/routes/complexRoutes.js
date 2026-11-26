const express = require("express");

const router = express.Router();

const complexController = require("../controllers/complexController");

const authMiddleware = require("../middleware/authMiddleware");

const { uploadComplexImage } = require("../middleware/uploadMiddleware");

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Get all active complexes
router.get("/", complexController.getAllComplexes);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get logged-in admin complexes
router.get("/my", authMiddleware, complexController.getMyComplexes);

// Create complex with image
router.post(
  "/",
  authMiddleware,
  uploadComplexImage,
  complexController.createComplex,
);

// Update complex with optional image
router.put(
  "/:id",
  authMiddleware,
  uploadComplexImage,
  complexController.updateComplex,
);

// Activate / deactivate complex
router.patch(
  "/:id/status",
  authMiddleware,
  complexController.updateComplexStatus,
);

// Add unavailable dates
router.post(
  "/:id/unavailable-dates",
  authMiddleware,
  complexController.addUnavailableDates,
);

// Remove unavailable dates
router.delete(
  "/:id/unavailable-dates/:rangeId",
  authMiddleware,
  complexController.removeUnavailableDates,
);

// Get single active complex
router.get("/:id", complexController.getComplexById);

module.exports = router;
