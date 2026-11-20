const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  createComplex,
  getAllComplexes,
  getMyComplexes,
  getComplexById,
  updateComplex,
  updateComplexStatus,
  addUnavailableDates,
  removeUnavailableDates,
} = require("../controllers/complexController");

// Public APIs
router.get("/", getAllComplexes);

router.get("/my", authMiddleware, allowRoles("complex_admin"), getMyComplexes);

router.get("/:id", getComplexById);

// All routes below require Complex Admin authentication
router.use(authMiddleware);
router.use(allowRoles("complex_admin"));

router.post("/", createComplex);

router.put("/:id", updateComplex);

router.patch("/:id/status", updateComplexStatus);

router.post("/:id/unavailable-dates", addUnavailableDates);

router.delete("/:id/unavailable-dates/:rangeId", removeUnavailableDates);

module.exports = router;
