const express = require("express");
const router = express.Router();

const {
  getMasterSports,
  createMasterSport,
} = require("../controllers/masterSportController");

router.get("/", getMasterSports);
router.post("/", createMasterSport);

module.exports = router;
