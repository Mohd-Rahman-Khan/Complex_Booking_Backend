const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      unique: true,
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    complexId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complex",
      required: true,
      index: true,
    },

    // References Complex.sports._id (embedded sport)
    sportId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    bookingDate: {
      type: String,
      required: true,
      index: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    durationMinutes: {
      type: Number,
      required: true,
      min: 15,
    },

    price: {
      baseAmount: {
        type: Number,
        required: true,
      },
      groundAmount: {
        type: Number,
        default: 0,
      },

      coachAmount: {
        type: Number,
        default: 0,
      },

      discountAmount: {
        type: Number,
        default: 0,
      },

      gstPercentage: {
        type: Number,
        default: 18,
      },

      gstAmount: {
        type: Number,
        default: 0,
      },

      totalAmount: {
        type: Number,
        required: true,
      },
    },

    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coach",
      default: null,
      index: true,
    },

    coachDetails: {
      name: {
        type: String,
        default: "",
      },

      specialization: {
        type: String,
        default: "",
      },

      hourlyFee: {
        type: Number,
        default: 0,
      },

      amount: {
        type: Number,
        default: 0,
      },
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    paymentMethod: {
      type: String,
      default: "",
    },

    transactionId: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["confirmed", "cancelled"],
      default: "pending",
      index: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

bookingSchema.index({
  complexId: 1,
  sportId: 1,
  bookingDate: 1,
  status: 1,
  coachId: 1,
  bookingDate: 1,
  status: 1,
});

module.exports = mongoose.model("Booking", bookingSchema);
