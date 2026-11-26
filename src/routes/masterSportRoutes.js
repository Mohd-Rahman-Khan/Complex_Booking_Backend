const express = require("express");

const router = express.Router();

const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");

const { uploadMasterSport } = require("../middleware/masterSportUpload");

const {
  getMasterSports,
  getMasterSportById,
  createMasterSport,
  updateMasterSport,
  updateMasterSportStatus,
} = require("../controllers/masterSportController");

// Platform admin authorization
const requireSuperAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const admin = await User.findOne({
      _id: userId,
      role: "super_admin",
      isActive: true,
    }).select("_id");

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Platform admin access required",
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to verify admin access",
    });
  }
};

// Public APIs
router.get("/", getMasterSports);

router.get("/:id", getMasterSportById);

// Protected APIs
router.post("/", authMiddleware, uploadMasterSport, createMasterSport);

router.put(
  "/:id",
  authMiddleware,
  requireSuperAdmin,
  uploadMasterSport,
  updateMasterSport,
);

router.patch(
  "/:id/status",
  authMiddleware,
  requireSuperAdmin,
  updateMasterSportStatus,
);

module.exports = router;
