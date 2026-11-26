const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"), {
    dotfiles: "deny",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

console.log("Uploads Path:", path.join(__dirname, "../uploads"));

const authRoutes = require("./routes/authRoutes");
const complexRoutes = require("./routes/complexRoutes");
const sportRoutes = require("./routes/sportRoutes");
const masterSportRoutes = require("./routes/masterSportRoutes");
const availabilityRoutes = require("./routes/availabilityRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const subadminRoutes = require("./routes/subadminRoutes");
const coachRoutes = require("./routes/coachRoutes");

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
app.use("/api/subadmins", subadminRoutes);
app.use("/api/coaches", coachRoutes);

module.exports = app;
