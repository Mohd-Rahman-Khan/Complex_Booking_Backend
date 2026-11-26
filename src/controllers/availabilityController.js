const mongoose = require("mongoose");

const Complex = require("../models/Complex");
const Booking = require("../models/Booking");

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

const SLOT_INTERVAL = 60;

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

    // 5. Find selected sport
    const sport = complex.sports.id(sportId);

    if (!sport || !sport.isActive) {
      return res.status(404).json({
        success: false,
        message: "Sport not found or inactive in this complex",
      });
    }

    // 6. Fetch actual confirmed bookings from MongoDB
    // Do not depend on configured sport slots.
    const bookings = await Booking.find({
      complexId,
      sportId,
      bookingDate: date,
      status: "confirmed",
    })
      .select("_id bookingDate startTime endTime durationMinutes status")
      .sort({ startTime: 1 })
      .lean();

    // 7. Normalize booked slots
    const bookedSlots = bookings.map((booking) => {
      const startMinutes = timeToMinutes(booking.startTime);
      const endMinutes = timeToMinutes(booking.endTime);

      if (
        !Number.isFinite(startMinutes) ||
        !Number.isFinite(endMinutes) ||
        startMinutes < 0 ||
        endMinutes > 1440 ||
        endMinutes <= startMinutes
      ) {
        throw new Error("Invalid stored booking timings");
      }

      return {
        _id: booking._id,
        complexId,
        sportId,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        startMinutes,
        endMinutes,
        durationMinutes: endMinutes - startMinutes,
        status: booking.status,
      };
    });

    bookedSlots.sort((a, b) => a.startMinutes - b.startMinutes);

    // 8. Check booking window
    if (!isBookingWindowValid(date, sport.bookingWindowDays)) {
      return res.status(200).json({
        success: true,
        date,
        durationMinutes,
        message: `Bookings are allowed only within ${sport.bookingWindowDays} days`,
        data: {
          isBookable: false,
          availableSlots: [],
          bookedSlots,
          totalBooked: bookedSlots.length,
        },
      });
    }

    // 9. Check unavailable dates
    if (isDateUnavailable(complex, date)) {
      return res.status(200).json({
        success: true,
        date,
        durationMinutes,
        message: "Complex is unavailable on this date",
        data: {
          isBookable: false,
          availableSlots: [],
          bookedSlots,
          totalBooked: bookedSlots.length,
        },
      });
    }

    // 10. Complex operating hours
    const opening = timeToMinutes(complex.openingTime);
    const closing = timeToMinutes(complex.closingTime);

    if (
      !Number.isFinite(opening) ||
      !Number.isFinite(closing) ||
      opening < 0 ||
      closing > 1440 ||
      closing <= opening
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex opening or closing time",
      });
    }

    // 11. Today's date
    const today = new Date();

    const todayString = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    const currentMinutes = date === todayString ? getCurrentMinutes() : null;

    if (date < todayString) {
      return res.status(200).json({
        success: true,
        date,
        durationMinutes,
        message: "Past dates are not available for booking",
        data: {
          isBookable: false,
          availableSlots: [],
          bookedSlots,
          totalBooked: bookedSlots.length,
        },
      });
    }

    // 12. Generate dynamic available slots
    const availableSlots = [];

    for (
      let start = opening;
      start + durationMinutes <= closing;
      start += SLOT_INTERVAL
    ) {
      const end = start + durationMinutes;

      // Prevent past-time booking
      if (currentMinutes !== null && start <= currentMinutes) {
        continue;
      }

      // Prevent booking overlap
      const isBooked = bookedSlots.some(
        (booking) => start < booking.endMinutes && end > booking.startMinutes,
      );

      if (isBooked) {
        continue;
      }

      // Calculate dynamic price
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
        startMinutes: start,
        endMinutes: end,
        durationMinutes,
        price,
        status: "available",
      });
    }

    // 13. Return availability and actual booked slots
    return res.status(200).json({
      success: true,
      message: "Availability fetched successfully",
      date,
      durationMinutes,
      data: {
        complexId,
        sportId,
        openingTime: complex.openingTime,
        closingTime: complex.closingTime,
        isBookable: true,
        totalAvailable: availableSlots.length,
        totalBooked: bookedSlots.length,
        availableSlots,
        bookedSlots,
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
