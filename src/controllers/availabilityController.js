const mongoose = require("mongoose");

const Complex = require("../models/Complex");
const Booking = require("../models/Booking");

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

exports.getAvailability = async (req, res) => {
  try {
    const { complexId, sportId } = req.params;
    const { date, duration = "120" } = req.query;

    // 1. Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(complexId) ||
      !mongoose.Types.ObjectId.isValid(sportId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex or sport ID",
      });
    }

    // 2. Validate date
    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "Valid date is required in YYYY-MM-DD format",
      });
    }

    // 3. Validate duration
    const durationMinutes = Number(duration);

    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 15 ||
      durationMinutes > 1440 ||
      durationMinutes % 15 !== 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Duration must be between 15 and 1440 minutes in 15-minute increments",
      });
    }

    // 4. Fetch active complex
    const complex = await Complex.findOne({
      _id: complexId,
      isActive: true,
    });

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or inactive",
      });
    }

    // 5. Find embedded sport
    const sport = complex.sports.id(sportId);

    if (!sport || !sport.isActive) {
      return res.status(404).json({
        success: false,
        message: "Sport not found or inactive in this complex",
      });
    }

    // 6. Validate booking window
    if (!isBookingWindowValid(date, sport.bookingWindowDays)) {
      return res.status(400).json({
        success: false,
        message: `Bookings are allowed only within ${sport.bookingWindowDays} days`,
      });
    }

    // 7. Check complex unavailable dates
    if (isDateUnavailable(complex, date)) {
      return res.status(200).json({
        success: true,
        date,
        durationMinutes,
        message: "Complex is unavailable on this date",
        data: {
          availableSlots: [],
          bookedSlots: [],
        },
      });
    }

    // 8. Validate complex operating hours
    const opening = timeToMinutes(complex.openingTime);
    const closing = timeToMinutes(complex.closingTime);

    if (opening === null || closing === null || closing <= opening) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex opening or closing time",
      });
    }

    // 9. Get active sport slots
    const intervals = getActiveIntervals(sport);

    if (!intervals.length) {
      return res.status(200).json({
        success: true,
        date,
        durationMinutes,
        data: {
          availableSlots: [],
          bookedSlots: [],
        },
      });
    }

    // 10. Fetch existing bookings
    const bookings = await Booking.find({
      complexId,
      sportId,
      bookingDate: date,
      status: {
        $in: ["pending", "confirmed"],
      },
    }).select("startTime endTime durationMinutes status bookingNumber");

    // 11. Get today's date
    const today = new Date();

    const todayString = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    const currentMinutes = date === todayString ? getCurrentMinutes() : null;

    // 12. Generate available booking options
    const availableSlots = [];
    const addedStarts = new Set();

    for (const interval of intervals) {
      const start = interval.start;
      const end = start + durationMinutes;

      // Avoid duplicate start times
      if (addedStarts.has(start)) {
        continue;
      }

      addedStarts.add(start);

      // Check complex operating hours
      if (start < opening || end > closing) {
        continue;
      }

      // Check whether requested duration is covered
      // by active configured slots.
      if (!isRangeCovered(intervals, start, end)) {
        continue;
      }

      // Prevent past-time bookings
      if (currentMinutes !== null && start <= currentMinutes) {
        continue;
      }

      // Check booking overlap
      if (hasBookingOverlap(start, end, bookings)) {
        continue;
      }

      // Calculate price
      let price;

      try {
        price = calculateBookingPrice({
          sport,
          bookingDate: date,
          start,
          end,
        });
      } catch (priceError) {
        console.error("Availability Pricing Error:", priceError.message);

        continue;
      }

      availableSlots.push({
        startTime: minutesToTime(start),
        endTime: minutesToTime(end),
        durationMinutes,
        price,
      });
    }

    // Sort available options by start time
    availableSlots.sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );

    // 13. Response
    return res.status(200).json({
      success: true,
      date,
      durationMinutes,
      data: {
        availableSlots,
        bookedSlots: bookings.map((booking) => ({
          bookingNumber: booking.bookingNumber,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
        })),
      },
    });
  } catch (error) {
    console.error("Get Availability Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch availability",
    });
  }
};
