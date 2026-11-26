const express = require("express");

const router = express.Router();

const subadminController = require("../controllers/subadminController");

const authMiddleware = require("../middleware/authMiddleware");

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(authMiddleware);

// ==========================================
// CREATE SUBADMIN
// POST /api/subadmins
// ==========================================

router.post("/", subadminController.createSubadmin);

// ==========================================
// GET ALL SUBADMINS
// GET /api/subadmins
// ==========================================

router.get("/", subadminController.getSubadmins);

// ==========================================
// GET LOGGED-IN SUBADMIN ASSIGNED SPORTS
// GET /api/subadmins/my-sports
// ==========================================

router.get("/my-sports", subadminController.getMySports);

// ==========================================
// GET LOGGED-IN SUBADMIN ASSIGNED BOOKINGS
// GET /api/subadmins/my-bookings
// ==========================================

router.get("/my-bookings", subadminController.getMyBookings);

// ==========================================
// GET COMPLEX SPORTS AND SUBADMINS
// GET /api/subadmins/complex/:complexId
// ==========================================

router.get("/complex/:complexId", subadminController.getComplexSubadmins);

// ==========================================
// ASSIGN / REPLACE / UNASSIGN SPORT
// ==========================================

router.patch("/:subadminId/assign-sport", subadminController.assignSport);

// ==========================================
// ACTIVATE / DEACTIVATE SUBADMIN
// ==========================================

router.patch("/:subadminId/status", subadminController.updateSubadminStatus);

module.exports = router;
