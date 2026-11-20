const mongoose = require("mongoose");
const crypto = require("crypto");

const Complex = require("../models/Complex");
const Booking = require("../models/Booking");
const BookingDayLock = require("../models/BookingDayLock");

const {
  timeToMinutes,
  minutesToTime,
  isValidDate,
  isDateUnavailable,
  isBookingWindowValid,
  getActiveIntervals,
  isRangeCovered,
  hasBookingOverlap,
  getCurrentMinutes,
} = require("../utils/availabilityUtils");

const { calculateBookingPrice } = require("../utils/pricingUtils");

const getBookingContext = async ({
  complexId,
  sportId,
  bookingDate,
  startTime,
  durationMinutes,
}) => {
  if (
    !mongoose.Types.ObjectId.isValid(complexId) ||
    !mongoose.Types.ObjectId.isValid(sportId)
  ) {
    throw new Error("Invalid complex or sport ID");
  }

  if (!isValidDate(bookingDate)) {
    throw new Error("Valid bookingDate is required in YYYY-MM-DD format");
  }

  const start = timeToMinutes(startTime);

  if (start === null) {
    throw new Error("Valid startTime is required in HH:mm format");
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 1440 ||
    durationMinutes % 15 !== 0
  ) {
    throw new Error(
      "Duration must be between 15 and 1440 minutes in 15-minute increments",
    );
  }

  const end = start + durationMinutes;

  if (end > 1440) {
    throw new Error("Booking cannot cross midnight");
  }

  // Fetch complex with its embedded sports
  const complex = await Complex.findOne({
    _id: complexId,
    isActive: true,
  });

  if (!complex) {
    throw new Error("Complex not found or inactive");
  }

  // Find sport inside Complex.sports array
  const sport = complex.sports.id(sportId);

  if (!sport || !sport.isActive) {
    throw new Error("Sport not found or inactive in this complex");
  }

  if (!isBookingWindowValid(bookingDate, sport.bookingWindowDays)) {
    throw new Error(
      `Bookings are allowed only within ${sport.bookingWindowDays} days`,
    );
  }

  if (isDateUnavailable(complex, bookingDate)) {
    throw new Error("Complex is unavailable on this date");
  }

  const opening = timeToMinutes(complex.openingTime);
  const closing = timeToMinutes(complex.closingTime);

  if (opening === null || closing === null || closing <= opening) {
    throw new Error("Invalid complex opening or closing time");
  }

  if (start < opening || end > closing) {
    throw new Error("Booking is outside complex operating hours");
  }

  const intervals = getActiveIntervals(sport);

  const isConfiguredStart = intervals.some(
    (interval) => interval.start === start,
  );

  if (!isConfiguredStart || !isRangeCovered(intervals, start, end)) {
    throw new Error(
      "Selected duration is not available in configured sport slots",
    );
  }

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  if (bookingDate === todayString && start <= getCurrentMinutes()) {
    throw new Error("Cannot book a time that has already passed");
  }

  return {
    complex,
    sport,
    start,
    end,
    intervals,
  };
};

const getExistingBookings = async ({ complexId, sportId, bookingDate }) => {
  return Booking.find({
    complexId,
    sportId,
    bookingDate,
    status: { $in: ["pending", "confirmed"] },
  }).select("startTime endTime status");
};

// 1. Price preview
exports.pricePreview = async (req, res) => {
  try {
    const { complexId, sportId, bookingDate, startTime, durationMinutes } =
      req.body;

    const context = await getBookingContext({
      complexId,
      sportId,
      bookingDate,
      startTime,
      durationMinutes,
    });

    const bookings = await getExistingBookings({
      complexId,
      sportId,
      bookingDate,
    });

    if (hasBookingOverlap(context.start, context.end, bookings)) {
      return res.status(409).json({
        success: false,
        message: "Selected time is already booked",
      });
    }

    const price = calculateBookingPrice({
      sport: context.sport,
      bookingDate,
      start: context.start,
      end: context.end,
    });

    return res.status(200).json({
      success: true,
      message: "Price calculated successfully",
      data: {
        startTime,
        endTime: minutesToTime(context.end),
        durationMinutes,
        price,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// 2. Create booking
exports.createBooking = async (req, res) => {
  let createdBooking = null;

  try {
    const { complexId, sportId, bookingDate, startTime, durationMinutes } =
      req.body;

    const context = await getBookingContext({
      complexId,
      sportId,
      bookingDate,
      startTime,
      durationMinutes,
    });

    const bookings = await getExistingBookings({
      complexId,
      sportId,
      bookingDate,
    });

    if (hasBookingOverlap(context.start, context.end, bookings)) {
      return res.status(409).json({
        success: false,
        message: "Selected time is already booked",
      });
    }

    const price = calculateBookingPrice({
      sport: context.sport,
      bookingDate,
      start: context.start,
      end: context.end,
    });

    const bookingNumber = `SA-${Date.now()}-${crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;

    createdBooking = await Booking.create({
      bookingNumber,
      userId: req.user.userId,
      complexId,
      sportId,
      bookingDate,
      startTime,
      endTime: minutesToTime(context.end),
      durationMinutes,
      price,
      status: "pending",
      paymentStatus: "pending",
    });

    // Reserve every 15-minute bucket
    const lockDocuments = [];

    for (let minute = context.start; minute < context.end; minute += 15) {
      lockDocuments.push({
        complexId,
        sportId,
        bookingDate,
        bucketStart: minute,
        bookingId: createdBooking._id,
      });
    }

    await BookingDayLock.insertMany(lockDocuments, {
      ordered: true,
    });

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: {
        booking: createdBooking,
      },
    });
  } catch (error) {
    if (createdBooking) {
      await BookingDayLock.deleteMany({
        bookingId: createdBooking._id,
      }).catch(() => {});

      await Booking.deleteOne({
        _id: createdBooking._id,
      }).catch(() => {});
    }

    if (
      error.code === 11000 ||
      error.writeErrors?.some((e) => e.code === 11000)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This time slot has just been booked. Please select another time.",
      });
    }

    console.error("Create Booking Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create booking",
    });
  }
};

// 3. Cancel own booking
exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      userId: req.user.userId,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (!["pending", "confirmed"].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: "This booking cannot be cancelled",
      });
    }

    booking.status = "cancelled";
    booking.cancelledAt = new Date();
    booking.cancellationReason = req.body.reason || "Cancelled by customer";

    await booking.save();

    // Release reserved time buckets
    await BookingDayLock.deleteMany({
      bookingId: booking._id,
    });

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: { booking },
    });
  } catch (error) {
    console.error("Cancel Booking Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to cancel booking",
    });
  }
};
