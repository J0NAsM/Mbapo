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
