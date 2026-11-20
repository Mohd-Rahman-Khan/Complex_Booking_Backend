const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  createSport,
  getSportsByComplex,
  getMySports,
  getSportById,
  updateSport,
  assignPrimarySubAdmin,
  updateBookingWindow,
  updateSportPricing,
  updateSportStatus,
} = require("../controllers/sportController");

// Public: active sports of a complex
router.get("/complex/:complexId", getSportsByComplex);

// Protected: admin's assigned sports
router.get(
  "/my",
  authMiddleware,
  allowRoles("complex_admin", "sport_admin"),
  getMySports,
);

// Protected: sport details
router.get(
  "/:sportId",
  authMiddleware,
  allowRoles("complex_admin", "sport_admin"),
  getSportById,
);

// Only Complex Admin can create a sport
router.post("/", authMiddleware, allowRoles("complex_admin"), createSport);

// Complex Admin and assigned Sport Admin can update sport
router.put(
  "/:sportId",
  authMiddleware,
  allowRoles("complex_admin", "sport_admin"),
  updateSport,
);

// Only Complex Admin can assign primary subadmin
router.patch(
  "/:sportId/subadmin",
  authMiddleware,
  allowRoles("complex_admin"),
  assignPrimarySubAdmin,
);

// Both admins can update booking window and pricing
router.patch(
  "/:sportId/booking-window",
  authMiddleware,
  allowRoles("complex_admin", "sport_admin"),
  updateBookingWindow,
);

router.patch(
  "/:sportId/pricing",
  authMiddleware,
  allowRoles("complex_admin", "sport_admin"),
  updateSportPricing,
);

// Only Complex Admin can activate/deactivate
router.patch(
  "/:sportId/status",
  authMiddleware,
  allowRoles("complex_admin"),
  updateSportStatus,
);

module.exports = router;
