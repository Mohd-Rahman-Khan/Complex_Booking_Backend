const express = require("express");

const router = express.Router();

const coachController = require("../controllers/coachController");

const coachDashboardController = require("../controllers/coachDashboardController");

const authMiddleware = require("../middleware/authMiddleware");

// ==========================================
// PUBLIC CUSTOMER APIs
// ==========================================

// Get available coaches for selected booking

router.get("/availability", coachController.getAvailableCoaches);

// Get coaches assigned to complex sport

router.get(
  "/complex/:complexId/sport/:sportId",
  coachController.getSportCoaches,
);

// ==========================================
// AUTHENTICATED APIs
// ==========================================

router.use(authMiddleware);

// Create coach

router.post("/", coachController.createCoach);

// Get admin's coaches

router.get("/my", coachController.getMyCoaches);

// Get sport admin's assigned coaches

router.get("/my-assigned", coachController.getSubadminCoaches);

// Coach profile

router.get("/profile", coachDashboardController.getProfile);

// Coach dashboard

router.get("/dashboard", coachDashboardController.getDashboard);

// Get coach details

router.get("/:coachId", coachController.getCoachById);

// Update coach

router.put("/:coachId", coachController.updateCoach);

// Activate / deactivate coach

router.patch("/:coachId/status", coachController.updateCoachStatus);

// Assign / unassign coach

router.patch("/:coachId/assign-sport", coachController.assignCoach);

module.exports = router;
