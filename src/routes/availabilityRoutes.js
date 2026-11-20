const express = require("express");
const router = express.Router();

const availabilityController = require("../controllers/availabilityController");

// Public availability lookup
router.get("/:complexId/:sportId", availabilityController.getAvailability);

module.exports = router;
