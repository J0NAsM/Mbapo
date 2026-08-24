import assert from "node:assert/strict";
import test from "node:test";
import {
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
