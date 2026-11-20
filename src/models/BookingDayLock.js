const mongoose = require("mongoose");

const bookingDayLockSchema = new mongoose.Schema(
  {
    complexId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complex",
      required: true,
    },

    // References Complex.sports._id
    sportId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    bookingDate: {
      type: String,
      required: true,
    },

    // Minutes from midnight, e.g. 06:00 = 360
    bucketStart: {
      type: Number,
      required: true,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
  },
  { timestamps: true },
);

bookingDayLockSchema.index(
  {
    complexId: 1,
    sportId: 1,
    bookingDate: 1,
    bucketStart: 1,
  },
  { unique: true },
);

module.exports = mongoose.model("BookingDayLock", bookingDayLockSchema);
