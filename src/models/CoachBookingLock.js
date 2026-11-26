const mongoose = require("mongoose");

const coachBookingLockSchema = new mongoose.Schema(
  {
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coach",
      required: true,
    },

    bookingDate: {
      type: String,
      required: true,
    },

    bucketStart: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

coachBookingLockSchema.index(
  {
    coachId: 1,
    bookingDate: 1,
    bucketStart: 1,
  },
  {
    unique: true,
  },
);

module.exports = mongoose.model("CoachBookingLock", coachBookingLockSchema);
