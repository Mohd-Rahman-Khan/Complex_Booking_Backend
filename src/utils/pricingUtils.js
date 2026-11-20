const {
  timeToMinutes,
  getDateDay,
  getActiveIntervals,
} = require("./availabilityUtils");

const roundAmount = (amount) => {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};

const calculateBookingPrice = ({
  sport,
  bookingDate,
  start,
  end,
  gstPercentage = 18,
}) => {
  if (!sport) {
    throw new Error("Sport details are required");
  }

  const pricing = sport.pricing || {};
  const intervals = getActiveIntervals(sport);

  const weekendDays = pricing.weekendDays || [0, 6];
  const day = getDateDay(bookingDate);
  const isWeekend = weekendDays.includes(day);

  const normalRate = Number(
    isWeekend ? pricing.weekendPrice || 0 : pricing.weekdayPrice || 0,
  );

  const peakDefaultRate = Number(
    isWeekend ? pricing.weekendPeakPrice || 0 : pricing.weekdayPeakPrice || 0,
  );

  const peakHours = (pricing.peakHours || []).map((item) => ({
    start: timeToMinutes(item.startTime),
    end: timeToMinutes(item.endTime),
    price: Number(item.price || 0),
  }));

  let baseAmount = 0;

  // Calculate in 15-minute segments.
  for (let minute = start; minute < end; minute += 15) {
    const segmentEnd = minute + 15;

    const activeSlot = intervals.find(
      (item) => item.start <= minute && item.end >= segmentEnd,
    );

    if (!activeSlot) {
      throw new Error("Requested time is outside configured slots");
    }

    const peak = peakHours.find(
      (item) =>
        item.start !== null &&
        item.end !== null &&
        item.start < item.end &&
        minute < item.end &&
        segmentEnd > item.start,
    );

    let hourlyRate;

    if (peak && peak.price > 0) {
      hourlyRate = peak.price;
    } else if (peakDefaultRate > 0 && peak) {
      hourlyRate = peakDefaultRate;
    } else if (normalRate > 0) {
      hourlyRate = normalRate;
    } else {
      const slotDuration =
        Number(activeSlot.slot.duration) || activeSlot.end - activeSlot.start;

      hourlyRate = (Number(activeSlot.slot.price || 0) / slotDuration) * 60;
    }

    baseAmount += (hourlyRate * 15) / 60;
  }

  baseAmount = roundAmount(baseAmount);

  const discountAmount = 0;
  const taxableAmount = Math.max(0, baseAmount - discountAmount);
  const gstAmount = roundAmount((taxableAmount * gstPercentage) / 100);
  const totalAmount = roundAmount(taxableAmount + gstAmount);

  return {
    baseAmount,
    discountAmount,
    gstPercentage,
    gstAmount,
    totalAmount,
  };
};

module.exports = {
  calculateBookingPrice,
};
