const express = require("express");

const router = express.Router();

const { getAvailability } = require("../controllers/availabilityController");

router.get("/:complexId/:sportId", getAvailability);

module.exports = router;
