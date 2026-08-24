import assert from "node:assert/strict";
import test from "node:test";
import {
  availableBookingSlots,
  bookingOverlaps,
  bookingRange,
  isProfessionalAvailable,
} from "../server/domain/availability.js";

test("valida franjas horarias y detecta solapamientos", () => {
  assert.deepEqual(bookingRange("09:00 - 11:00"), { start: 540, end: 660 });
  assert.equal(bookingRange("11:00 - 09:00"), null);
  assert.equal(
    bookingOverlaps({ start: 540, end: 660 }, { start: 630, end: 720 }),
    true,
  );
  assert.equal(
    bookingOverlaps({ start: 540, end: 660 }, { start: 660, end: 720 }),
    false,
  );
});

test("genera franjas libres desde la agenda semanal sin solapamientos", () => {
  const slots = availableBookingSlots(
    {
      availability: [{ day: 1, start: "09:00", end: "15:00" }],
    },
    "2031-02-03",
    [
      {
        status: "Profesional confirmado",
        time: "10:30 - 12:30",
      },
      { status: "Cancelada", time: "13:00 - 15:00" },
    ],
  );
  assert.deepEqual(slots, ["12:30 - 14:30", "13:00 - 15:00"]);
});

test("solo acepta reservas dentro de la disponibilidad semanal", () => {
  const professional = {
    availability: [{ day: 1, start: "09:00", end: "17:00" }],
  };
  assert.equal(
    isProfessionalAvailable(professional, "2031-02-03", {
      start: 600,
      end: 720,
    }),
    true,
  );
  assert.equal(
    isProfessionalAvailable(professional, "2031-02-03", {
      start: 480,
      end: 600,
    }),
    false,
  );
  assert.equal(
    isProfessionalAvailable(professional, "2031-02-04", {
      start: 600,
      end: 720,
    }),
    false,
  );
});
