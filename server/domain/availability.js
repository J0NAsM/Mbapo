export function timeToMinutes(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

export function bookingRange(time) {
  const matches = String(time).match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
  if (!matches) return null;
  const start = timeToMinutes(matches[1]);
  const end = timeToMinutes(matches[2]);
  return start < end ? { start, end } : null;
}

export function bookingOverlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

export function isProfessionalAvailable(professional, date, range) {
  const slots = professional.availability || [];
  if (!slots.length) return true;
  const day = new Date(`${date}T12:00:00`).getDay();
  return slots.some(
    (slot) =>
      slot.day === day &&
      timeToMinutes(slot.start) <= range.start &&
      timeToMinutes(slot.end) >= range.end,
  );
}

const defaultSlots = [
  { start: 8 * 60, end: 10 * 60 },
  { start: 10 * 60 + 30, end: 12 * 60 + 30 },
  { start: 14 * 60, end: 16 * 60 },
  { start: 16 * 60 + 30, end: 18 * 60 + 30 },
];

function clock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

export function availableBookingSlots(
  professional,
  date,
  bookings = [],
  durationMinutes = 120,
) {
  const day = new Date(`${date}T12:00:00`).getDay();
  const availability = professional.availability || [];
  const candidates = availability.length
    ? availability
        .filter((slot) => slot.day === day)
        .flatMap((slot) => {
          const start = timeToMinutes(slot.start);
          const end = timeToMinutes(slot.end);
          const ranges = [];
          for (
            let cursor = start;
            cursor + durationMinutes <= end;
            cursor += 30
          )
            ranges.push({ start: cursor, end: cursor + durationMinutes });
          return ranges;
        })
    : defaultSlots;
  const occupied = bookings
    .filter((booking) => !["Cancelada", "Completada"].includes(booking.status))
    .map((booking) => bookingRange(booking.time))
    .filter(Boolean);
  const seen = new Set();
  return candidates
    .filter((range) => {
      const key = `${range.start}:${range.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return !occupied.some((booked) => bookingOverlaps(range, booked));
    })
    .sort((left, right) => left.start - right.start)
    .map((range) => `${clock(range.start)} - ${clock(range.end)}`);
}
