const mongoose = require("mongoose");

const coachSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    profileImage: {
      type: String,
      default: "",
    },

    experience: {
      type: Number,
      min: 0,
      default: 0,
    },

    specialization: {
      type: String,
      trim: true,
      default: "",
    },

    qualification: {
      type: String,
      trim: true,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    hourlyFee: {
      type: Number,
      required: true,
      min: 0,
    },

    workingDays: {
      type: [Number],
      default: [0, 1, 2, 3, 4, 5, 6],
      validate: {
        validator: (days) =>
          days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        message: "Invalid working days",
      },
    },

    openingTime: {
      type: String,
      default: "06:00",
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },

    closingTime: {
      type: String,
      default: "22:00",
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },

    unavailableRanges: [
      {
        fromDate: {
          type: String,
          required: true,
        },

        toDate: {
          type: String,
          required: true,
        },

        reason: {
          type: String,
          default: "",
        },
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Coach", coachSchema);
