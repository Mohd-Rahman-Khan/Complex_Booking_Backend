const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const complexRoutes = require("./routes/complexRoutes");
const sportRoutes = require("./routes/sportRoutes");
const masterSportRoutes = require("./routes/masterSportRoutes");
const availabilityRoutes = require("./routes/availabilityRoutes");
const bookingRoutes = require("./routes/bookingRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "SportsArena Backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/complexes", complexRoutes);
app.use("/api/sports", sportRoutes);

// Master Sports
app.use("/api/master-sports", masterSportRoutes);

app.use("/api/availability", availabilityRoutes);
app.use("/api/bookings", bookingRoutes);

module.exports = app;
