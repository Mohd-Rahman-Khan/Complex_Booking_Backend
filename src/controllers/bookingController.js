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
  hasBookingOverlap,
  getCurrentMinutes,
} = require("../utils/availabilityUtils");

const { calculateBookingPrice } = require("../utils/pricingUtils");

// ==========================================
// BOOKING CONFIGURATION
// ==========================================

const MIN_BOOKING_DURATION = 15;
const MAX_BOOKING_DURATION = 1440;
const BOOKING_INTERVAL = 15;
const START_TIME_INTERVAL = 60;

// ==========================================
// 1. VALIDATE BOOKING CONTEXT
// ==========================================

const getBookingContext = async ({
  complexId,
  sportId,
  bookingDate,
  startTime,
  durationMinutes,
}) => {
  // Validate IDs
  if (
    !mongoose.Types.ObjectId.isValid(complexId) ||
    !mongoose.Types.ObjectId.isValid(sportId)
  ) {
    throw new Error("Invalid complex or sport ID");
  }

  // Validate booking date
  if (!isValidDate(bookingDate)) {
    throw new Error("Valid bookingDate is required in YYYY-MM-DD format");
  }

  // Validate start time
  if (
    typeof startTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
  ) {
    throw new Error("Valid startTime is required in HH:mm format");
  }

  const start = timeToMinutes(startTime);

  if (!Number.isInteger(start) || start < 0 || start >= 1440) {
    throw new Error("Invalid booking start time");
  }

  // Validate duration
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < MIN_BOOKING_DURATION ||
    durationMinutes > MAX_BOOKING_DURATION ||
    durationMinutes % BOOKING_INTERVAL !== 0
  ) {
    throw new Error(
      "Duration must be between 15 and 1440 minutes in 15-minute increments",
    );
  }

  // Validate booking lock interval
  if (start % BOOKING_INTERVAL !== 0) {
    throw new Error("Booking start time must be in 15-minute increments");
  }

  const end = start + durationMinutes;

  // Prevent midnight crossing
  if (end > 1440) {
    throw new Error("Booking cannot cross midnight");
  }

  // Fetch active complex
  const complex = await Complex.findOne({
    _id: complexId,
    isActive: true,
  });

  if (!complex) {
    throw new Error("Complex not found or inactive");
  }

  // Find embedded sport
  const sport = complex.sports.id(sportId);

  if (!sport || !sport.isActive) {
    throw new Error("Sport not found or inactive in this complex");
  }

  // Validate booking window
  if (!isBookingWindowValid(bookingDate, sport.bookingWindowDays)) {
    throw new Error(
      `Bookings are allowed only within ${sport.bookingWindowDays} days`,
    );
  }

  // Check unavailable dates
  if (isDateUnavailable(complex, bookingDate)) {
    throw new Error("Complex is unavailable on this date");
  }

  // Opening and closing time
  const opening = timeToMinutes(complex.openingTime);
  const closing = timeToMinutes(complex.closingTime);

  if (
    !Number.isInteger(opening) ||
    !Number.isInteger(closing) ||
    closing <= opening
  ) {
    throw new Error("Invalid complex opening or closing time");
  }

  // Check operating hours
  if (start < opening || end > closing) {
    throw new Error(
      `Booking must be between ${complex.openingTime} and ${complex.closingTime}`,
    );
  }

  // ==========================================
  // DYNAMIC SLOT VALIDATION
  // ==========================================

  // No dependency on configured sport.slots
  // Start times are generated at 60-minute intervals

  const isValidDynamicStart = (start - opening) % START_TIME_INTERVAL === 0;

  if (!isValidDynamicStart) {
    throw new Error("Please select a valid booking start time");
  }

  // Current date
  const today = new Date();

  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  // Prevent past date booking
  if (bookingDate < todayString) {
    throw new Error("Cannot create a booking for a past date");
  }

  // Prevent past time booking
  if (bookingDate === todayString && start <= getCurrentMinutes()) {
    throw new Error("Cannot book a time that has already passed");
  }

  return {
    complex,
    sport,
    start,
    end,
    opening,
    closing,
  };
};

// ==========================================
// 2. GET EXISTING BOOKINGS
// ==========================================

const getExistingBookings = async ({ complexId, sportId, bookingDate }) => {
  return Booking.find({
    complexId,
    sportId,
    bookingDate,

    // Only confirmed bookings
    status: "confirmed",
  }).select("startTime endTime status");
};

// ==========================================
// 3. PRICE PREVIEW API
// POST /api/bookings/price-preview
// ==========================================

exports.pricePreview = async (req, res) => {
  try {
    const { complexId, sportId, bookingDate, startTime, durationMinutes } =
      req.body;

    // Validate booking
    const context = await getBookingContext({
      complexId,
      sportId,
      bookingDate,
      startTime,
      durationMinutes,
    });

    // Fetch existing confirmed bookings
    const bookings = await getExistingBookings({
      complexId,
      sportId,
      bookingDate,
    });

    // Check overlapping bookings
    if (hasBookingOverlap(context.start, context.end, bookings)) {
      return res.status(409).json({
        success: false,
        message: "Selected time is already booked",
      });
    }

    // Calculate dynamic price
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
        complexId,
        sportId,
        bookingDate,
        startTime,
        endTime: minutesToTime(context.end),
        durationMinutes,
        price,
      },
    });
  } catch (error) {
    console.error("Price Preview Error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to calculate price",
    });
  }
};

// ==========================================
// 4. CREATE BOOKING API
// POST /api/bookings
// ==========================================

exports.createBooking = async (req, res) => {
  let createdBooking = null;

  try {
    // Validate authenticated user
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const { complexId, sportId, bookingDate, startTime, durationMinutes } =
      req.body;

    // Validate dynamic booking
    const context = await getBookingContext({
      complexId,
      sportId,
      bookingDate,
      startTime,
      durationMinutes,
    });

    // Get already booked slots
    const bookings = await getExistingBookings({
      complexId,
      sportId,
      bookingDate,
    });

    // Check overlapping bookings
    if (hasBookingOverlap(context.start, context.end, bookings)) {
      return res.status(409).json({
        success: false,
        message: "Selected time is already booked",
      });
    }

    // Calculate actual backend price
    const price = calculateBookingPrice({
      sport: context.sport,
      bookingDate,
      start: context.start,
      end: context.end,
    });

    // Generate unique booking number
    const bookingNumber = `SA-${Date.now()}-${crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;

    // ==========================================
    // CREATE CONFIRMED BOOKING
    // ==========================================

    createdBooking = await Booking.create({
      bookingNumber,

      userId: req.user.userId,

      complexId,
      sportId,
      bookingDate,

      startTime: minutesToTime(context.start),
      endTime: minutesToTime(context.end),

      durationMinutes,

      price,

      // Direct confirmed booking
      status: "confirmed",

      // Payment status is separate
      paymentStatus: "pending",
    });

    // ==========================================
    // RESERVE 15-MINUTE TIME BUCKETS
    // ==========================================

    const lockDocuments = [];

    for (
      let minute = context.start;
      minute < context.end;
      minute += BOOKING_INTERVAL
    ) {
      lockDocuments.push({
        complexId,
        sportId,
        bookingDate,

        bucketStart: minute,

        bookingId: createdBooking._id,
      });
    }

    // Prevent concurrent duplicate bookings
    await BookingDayLock.insertMany(lockDocuments, {
      ordered: true,
    });

    console.log("Booking confirmed:", createdBooking.bookingNumber);

    return res.status(201).json({
      success: true,
      message: "Booking confirmed successfully",

      data: {
        booking: createdBooking,
      },
    });
  } catch (error) {
    // Rollback booking if slot locking fails
    if (createdBooking) {
      await BookingDayLock.deleteMany({
        bookingId: createdBooking._id,
      }).catch((cleanupError) => {
        console.error("Lock cleanup error:", cleanupError);
      });

      await Booking.deleteOne({
        _id: createdBooking._id,
      }).catch((cleanupError) => {
        console.error("Booking cleanup error:", cleanupError);
      });
    }

    // Handle duplicate booking buckets
    if (
      error.code === 11000 ||
      error.writeErrors?.some((item) => item.code === 11000)
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

// ==========================================
// 5. CANCEL BOOKING API
// PATCH /api/bookings/:bookingId/cancel
// ==========================================

exports.cancelBooking = async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const { bookingId } = req.params;

    // Validate booking ID
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    // Find user's booking
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

    // Only confirmed booking can be cancelled
    if (booking.status !== "confirmed") {
      return res.status(400).json({
        success: false,
        message: "This booking cannot be cancelled",
      });
    }

    // Update booking status
    booking.status = "cancelled";

    booking.cancelledAt = new Date();

    booking.cancellationReason = req.body?.reason || "Cancelled by customer";

    await booking.save();

    // Release reserved booking buckets
    await BookingDayLock.deleteMany({
      bookingId: booking._id,
    });

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",

      data: {
        booking,
      },
    });
  } catch (error) {
    console.error("Cancel Booking Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to cancel booking",
    });
  }
};

// ==========================================
// 6. GET MY BOOKINGS API
// GET /api/bookings/my-bookings
// ==========================================

exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Fetch logged-in user's bookings
    const bookings = await Booking.find({
      userId,
    })
      .sort({
        bookingDate: -1,
        startTime: -1,
      })
      .lean();

    // Fetch all related complexes
    const complexIds = [
      ...new Set(bookings.map((item) => String(item.complexId))),
    ];

    const complexes = await Complex.find({
      _id: {
        $in: complexIds,
      },
    })
      .select("name address city sports")
      .lean();

    // Create complex lookup map
    const complexMap = new Map(
      complexes.map((item) => [String(item._id), item]),
    );

    // Format booking response
    const formattedBookings = bookings.map((booking) => {
      const complex = complexMap.get(String(booking.complexId));

      const sport = complex?.sports?.find(
        (item) => String(item._id) === String(booking.sportId),
      );

      return {
        ...booking,

        groundName: complex?.name || "Sports Complex",

        groundLocation: [complex?.address, complex?.city]
          .filter(Boolean)
          .join(", "),

        sportName: sport?.name || "Sport",

        sportIcon: sport?.icon || "🏆",
      };
    });

    return res.status(200).json({
      success: true,
      message: "Bookings fetched successfully",

      count: formattedBookings.length,

      data: {
        bookings: formattedBookings,
      },
    });
  } catch (error) {
    console.error("Get My Bookings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch bookings",
    });
  }
};

// ==========================================
// 7. GET ADMIN BOOKINGS API
// GET /api/bookings/admin/bookings
// ==========================================

exports.getAdminBookings = async (req, res) => {
  try {
    const adminId = req.user?.userId;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // ==========================================
    // GET ALL COMPLEXES OWNED BY ADMIN
    // ==========================================

    const complexes = await Complex.find({
      adminId,
    }).lean();

    const complexIds = complexes.map((item) => item._id);

    console.log("Admin ID:", adminId);

    console.log("Admin Complex IDs:", complexIds);

    // ==========================================
    // FETCH BOOKINGS ACROSS ALL COMPLEXES
    // ==========================================

    const bookings = await Booking.find({
      complexId: {
        $in: complexIds,
      },
    })
      .populate("userId", "name mobile phone")
      .sort({
        bookingDate: -1,
        startTime: -1,
        createdAt: -1,
      })
      .lean();

    console.log("Total Admin Bookings:", bookings.length);

    // Create complex lookup map
    const complexMap = new Map(
      complexes.map((item) => [String(item._id), item]),
    );

    // Format booking response
    const formattedBookings = bookings.map((booking) => {
      const complex = complexMap.get(String(booking.complexId));

      const sport = complex?.sports?.find(
        (item) => String(item._id) === String(booking.sportId),
      );

      return {
        ...booking,

        groundName: complex?.name || "Sports Complex",

        groundLocation: [complex?.address, complex?.city]
          .filter(Boolean)
          .join(", "),

        sportName: sport?.name || "Sport",

        sportIcon: sport?.icon || "🏆",

        customerName: booking.userId?.name || "Customer",

        customerMobile: booking.userId?.mobile || booking.userId?.phone || "",
      };
    });

    // ==========================================
    // BOOKING STATISTICS
    // ==========================================

    const confirmed = bookings.filter((item) => item.status === "confirmed");

    const cancelled = bookings.filter((item) => item.status === "cancelled");

    // Total value of confirmed reservations
    const totalBookingAmount = confirmed.reduce(
      (total, item) => total + Number(item.price?.totalAmount || 0),
      0,
    );

    // Actual paid revenue from confirmed bookings
    const revenue = confirmed
      .filter((item) => item.paymentStatus === "paid")
      .reduce((total, item) => total + Number(item.price?.totalAmount || 0), 0);

    return res.status(200).json({
      success: true,
      message: "Admin bookings fetched successfully",

      data: {
        adminId,

        totalComplexes: complexes.length,

        complexes: complexes.map((item) => ({
          _id: item._id,
          name: item.name,
        })),

        stats: {
          total: bookings.length,

          confirmed: confirmed.length,

          cancelled: cancelled.length,

          totalBookingAmount,

          revenue,
        },

        bookings: formattedBookings,
      },
    });
  } catch (error) {
    console.error("Get Admin Bookings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch admin bookings",
    });
  }
};
