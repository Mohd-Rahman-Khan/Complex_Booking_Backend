const { timeToMinutes, getDateDay } = require("./availabilityUtils");

const roundAmount = (amount) => {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};

// ==========================================
// VALIDATE HOURLY RATE
// ==========================================

const validateRate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} is not configured`);
  }

  const rate = Number(value);

  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return rate;
};

// ==========================================
// CALCULATE DYNAMIC BOOKING PRICE
// ==========================================

const calculateBookingPrice = ({
  sport,
  bookingDate,
  start,
  end,
  gstPercentage = 18,
}) => {
  // Validate sport
  if (!sport) {
    throw new Error("Sport details are required");
  }

  // Validate booking time
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > 1440 ||
    end <= start
  ) {
    throw new Error("Invalid booking time range");
  }

  if (!Number.isFinite(gstPercentage) || gstPercentage < 0) {
    throw new Error("Invalid GST percentage");
  }

  // Get pricing from embedded sport
  const pricing = sport.pricing;

  if (!pricing) {
    throw new Error("Sport pricing is not configured");
  }

  // ==========================================
  // 1. WEEKDAY AND WEEKEND PRICING
  // ==========================================

  const weekendDays = Array.isArray(pricing.weekendDays)
    ? pricing.weekendDays
    : [0, 6];

  const day = getDateDay(bookingDate);

  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new Error("Invalid booking date");
  }

  const isWeekend = weekendDays.includes(day);

  // Validate all configured rates
  const weekdayNormalRate = validateRate(
    pricing.weekdayPrice,
    "Weekday normal price",
  );

  const weekdayPeakRate = validateRate(
    pricing.weekdayPeakPrice,
    "Weekday peak price",
  );

  const weekendNormalRate = validateRate(
    pricing.weekendPrice,
    "Weekend normal price",
  );

  const weekendPeakRate = validateRate(
    pricing.weekendPeakPrice,
    "Weekend peak price",
  );

  // ==========================================
  // 2. CONFIGURED PEAK HOURS
  // ==========================================

  const peakHours = (
    Array.isArray(pricing.peakHours) ? pricing.peakHours : []
  ).map((item) => {
    const peakStart = timeToMinutes(item.startTime);
    const peakEnd = timeToMinutes(item.endTime);

    if (
      !Number.isInteger(peakStart) ||
      !Number.isInteger(peakEnd) ||
      peakStart < 0 ||
      peakStart >= 1440 ||
      peakEnd < 0 ||
      peakEnd > 1440 ||
      peakStart === peakEnd
    ) {
      throw new Error("Invalid peak hour configuration");
    }

    return {
      start: peakStart,
      end: peakEnd,
    };
  });

  // Check whether a particular minute is peak time
  const isPeakMinute = (minute) => {
    return peakHours.some((peak) => {
      // Normal peak range
      // Example: 18:00 - 21:00
      if (peak.start < peak.end) {
        return minute >= peak.start && minute < peak.end;
      }

      // Overnight peak range
      // Example: 22:00 - 02:00
      return minute >= peak.start || minute < peak.end;
    });
  };

  // ==========================================
  // 3. CALCULATE DYNAMIC PRICE
  // ==========================================

  let baseAmount = 0;

  const breakdown = [];

  // Calculate minute-by-minute for accurate pricing
  for (let minute = start; minute < end; minute += 1) {
    const isPeak = isPeakMinute(minute);

    let hourlyRate;
    let label;

    if (isWeekend && isPeak) {
      hourlyRate = weekendPeakRate;
      label = "Weekend Peak";
    } else if (isWeekend) {
      hourlyRate = weekendNormalRate;
      label = "Weekend Normal";
    } else if (isPeak) {
      hourlyRate = weekdayPeakRate;
      label = "Weekday Peak";
    } else {
      hourlyRate = weekdayNormalRate;
      label = "Weekday Normal";
    }

    // Price for one minute
    const minuteAmount = hourlyRate / 60;

    baseAmount += minuteAmount;

    // Group consecutive minutes having the same rate
    const last = breakdown[breakdown.length - 1];

    if (
      last &&
      last.label === label &&
      last.hourlyRate === hourlyRate &&
      last.endMinutes === minute
    ) {
      last.endMinutes = minute + 1;
      last.durationMinutes += 1;
    } else {
      breakdown.push({
        label,
        startMinutes: minute,
        endMinutes: minute + 1,
        durationMinutes: 1,
        hourlyRate,
        isPeak,
        isWeekend,
      });
    }
  }

  // ==========================================
  // 4. FORMAT PRICE BREAKDOWN
  // ==========================================

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  const priceBreakdown = breakdown.map((item) => ({
    ...item,

    startTime: formatTime(item.startMinutes),

    endTime: formatTime(item.endMinutes),

    amount: roundAmount((item.hourlyRate * item.durationMinutes) / 60),
  }));

  // ==========================================
  // 5. FINAL AMOUNT CALCULATION
  // ==========================================

  baseAmount = roundAmount(
    priceBreakdown.reduce((sum, item) => sum + item.amount, 0),
  );

  // Coupon functionality can be added later
  const discountAmount = 0;

  const taxableAmount = roundAmount(Math.max(0, baseAmount - discountAmount));

  const gstAmount = roundAmount((taxableAmount * gstPercentage) / 100);

  const totalAmount = roundAmount(taxableAmount + gstAmount);

  // ==========================================
  // 6. RETURN FINAL PRICE
  // ==========================================

  return {
    baseAmount,
    discountAmount,
    taxableAmount,
    gstPercentage,
    gstAmount,
    totalAmount,

    durationMinutes: end - start,

    isWeekend,

    breakdown: priceBreakdown,
  };
};

module.exports = {
  calculateBookingPrice,
};
