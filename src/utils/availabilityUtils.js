const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeToMinutes = (time) => {
  if (typeof time !== "string" || !TIME_REGEX.test(time)) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const isValidDate = (date) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

const getDateDay = (date) => {
  if (!isValidDate(date)) return null;

  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
};

const getDateDifference = (fromDate, toDate) => {
  if (!isValidDate(fromDate) || !isValidDate(toDate)) {
    return null;
  }

  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);

  return Math.round((to - from) / 86400000);
};

const isDateUnavailable = (complex, date) => {
  return (complex.unavailableRanges || []).some((range) => {
    return date >= range.fromDate && date <= range.toDate;
  });
};

const isBookingWindowValid = (date, days) => {
  if (!isValidDate(date)) return false;

  const bookingDays = Number(days);

  if (!Number.isInteger(bookingDays) || bookingDays < 0) {
    return false;
  }

  const today = new Date();

  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  const difference = getDateDifference(todayString, date);

  if (difference === null || difference < 0 || difference > bookingDays) {
    return false;
  }

  return true;
};

const getActiveIntervals = (sport) => {
  return (sport?.slots || [])
    .filter((slot) => slot.isActive !== false)
    .map((slot) => ({
      start: timeToMinutes(slot.startTime),
      end: timeToMinutes(slot.endTime),
      slot,
    }))
    .filter(
      (item) =>
        item.start !== null && item.end !== null && item.end > item.start,
    )
    .sort((a, b) => a.start - b.start);
};

// Adjacent and overlapping slots can be combined.
const isRangeCovered = (intervals, start, end) => {
  if (
    !Array.isArray(intervals) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return false;
  }

  let cursor = start;

  for (const interval of intervals) {
    if (interval.end <= cursor) continue;

    if (interval.start > cursor) return false;

    cursor = Math.max(cursor, interval.end);

    if (cursor >= end) return true;
  }

  return false;
};

const hasBookingOverlap = (start, end, bookings) => {
  return bookings.some((booking) => {
    const bookingStart = timeToMinutes(booking.startTime);
    const bookingEnd = timeToMinutes(booking.endTime);

    if (bookingStart === null || bookingEnd === null) {
      return false;
    }

    // Half-open interval.
    // 06:00-08:00 and 08:00-10:00 do not overlap.
    return start < bookingEnd && end > bookingStart;
  });
};

const getCurrentMinutes = () => {
  const now = new Date();

  return (
    now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0)
  );
};

module.exports = {
  timeToMinutes,
  minutesToTime,
  isValidDate,
  getDateDay,
  getDateDifference,
  isDateUnavailable,
  isBookingWindowValid,
  getActiveIntervals,
  isRangeCovered,
  hasBookingOverlap,
  getCurrentMinutes,
};
