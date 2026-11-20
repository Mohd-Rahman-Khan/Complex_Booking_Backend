const mongoose = require("mongoose");

const unavailableRangeSchema = new mongoose.Schema(
  {
    fromDate: { type: String, required: true },
    toDate: { type: String, required: true },
    reason: { type: String, default: "" },
  },
  { _id: true },
);

const slotSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    duration: { type: Number, required: true },
    price: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const peakHourSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    price: { type: Number, default: 0 },
  },
  { _id: false },
);

const sportSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: "" },
    description: { type: String, default: "" },

    primarySubAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    bookingWindowDays: { type: Number, default: 30 },

    slots: {
      type: [slotSchema],
      default: [],
    },

    pricing: {
      weekdayPrice: { type: Number, default: 0 },
      weekdayPeakPrice: { type: Number, default: 0 },
      weekendPrice: { type: Number, default: 0 },
      weekendPeakPrice: { type: Number, default: 0 },
      weekendDays: { type: [Number], default: [0, 6] },
      peakHours: { type: [peakHourSchema], default: [] },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const complexSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    description: { type: String, default: "" },

    openingTime: { type: String, default: "06:00" },
    closingTime: { type: String, default: "23:00" },

    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Complete sports data stored inside Complex
    sports: {
      type: [sportSchema],
      default: [],
    },

    unavailableRanges: {
      type: [unavailableRangeSchema],
      default: [],
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Complex", complexSchema);
