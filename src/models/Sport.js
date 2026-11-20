const mongoose = require("mongoose");

const slotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    duration: {
      type: Number,
      required: true,
      min: 15,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true },
);

const peakHourSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true },
);

const pricingSchema = new mongoose.Schema(
  {
    weekdayPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    weekdayPeakPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    weekendPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    weekendPeakPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    weekendDays: {
      type: [Number],
      default: [0, 6],
    },

    peakHours: {
      type: [peakHourSchema],
      default: [],
    },
  },
  { _id: false },
);

const sportSchema = new mongoose.Schema(
  {
    complexId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complex",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    icon: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    primarySubAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    bookingWindowDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
    },

    slots: {
      type: [slotSchema],
      default: [],
    },

    pricing: {
      type: pricingSchema,
      default: () => ({}),
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Same sport name should not be duplicated in one complex
sportSchema.index({ complexId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Sport", sportSchema);
