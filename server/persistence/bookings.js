import {
  bookingOverlaps,
  bookingRange,
  isProfessionalAvailable,
} from "../domain/availability.js";

export function createBookingsRepository(pool) {
  if (!pool) return null;
  const list = async (column, value) => {
    const result = await pool.query(
      `SELECT payload FROM bookings WHERE ${column} = $1 ORDER BY id DESC`,
      [value],
    );
    return result.rows.map((row) => row.payload);
  };
  return {
    async createWithEffects(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (input.idempotency) {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
            [
              input.accountId,
              `${input.idempotency.key}:${input.idempotency.method}:${input.idempotency.path}`,
            ],
          );
          const replay = await client.query(
            "SELECT response_status, response_body FROM idempotency_keys WHERE account_id = $1 AND key = $2 AND method = $3 AND path = $4 AND created_at > now() - interval '24 hours'",
            [
              input.accountId,
              input.idempotency.key,
              input.idempotency.method,
              input.idempotency.path,
            ],
          );
          if (replay.rows[0]) {
            await client.query("COMMIT");
            return {
              replayed: true,
              status: replay.rows[0].response_status,
              body: replay.rows[0].response_body,
            };
          }
        }
        const professionalResult = await client.query(
          "SELECT payload FROM professionals WHERE id = $1 FOR SHARE",
          [input.professionalId],
        );
        const professional = professionalResult.rows[0]?.payload;
        if (!professional?.available) {
          await client.query("COMMIT");
          return { error: "professional" };
        }
        const range = bookingRange(input.time);
        if (
          !range ||
          !isProfessionalAvailable(professional, input.date, range)
        ) {
          await client.query("COMMIT");
          return { error: "availability" };
        }
        await client.query("LOCK TABLE bookings IN EXCLUSIVE MODE");
        const current = await client.query(
          "SELECT payload FROM bookings WHERE professional_id = $1 AND payload->>'date' = $2",
          [input.professionalId, input.date],
        );
        if (
          current.rows.some((row) => {
            const item = row.payload;
            const existing = bookingRange(item.time);
            return (
              existing &&
              bookingOverlaps(existing, range) &&
              !["Cancelada", "Completada"].includes(item.status)
            );
          })
        ) {
          await client.query("COMMIT");
          return { error: "overlap" };
        }
        const id = Number(
          (
            await client.query(
              "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM bookings",
            )
          ).rows[0].id,
        );
        const booking = {
          id,
          professionalId: input.professionalId,
          clientId: input.accountId,
          title: `Servicio con ${professional.name}`,
          date: input.date,
          time: input.time,
          status: "Esperando respuesta",
          paymentStatus: "unpaid",
          place: input.place,
          amount: input.amount || professional.price * 2,
          timeline: [{ status: "Esperando respuesta", at: input.createdAt }],
        };
        await client.query(
          "INSERT INTO bookings (id, payload, client_account_id, professional_id) VALUES ($1,$2::jsonb,$3,$4)",
          [id, JSON.stringify(booking), input.accountId, input.professionalId],
        );
        if (professional.ownerId)
          await client.query(
            "INSERT INTO notifications (id, account_id, type, title, body, read_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [
              input.notificationId,
              professional.ownerId,
              "booking.created",
              "Nueva solicitud de reserva",
              `${input.clientName} solicitó ${booking.date} · ${booking.time}.`,
              null,
              input.createdAt,
            ],
          );
        await client.query("LOCK TABLE audit_log IN EXCLUSIVE MODE");
        const auditId = Number(
          (
            await client.query(
              "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM audit_log",
            )
          ).rows[0].id,
        );
        const audit = {
          id: auditId,
          actorId: input.accountId,
          action: "booking.created",
          entity: "booking",
          entityId: String(id),
          metadata: {},
          createdAt: input.createdAt,
        };
        await client.query(
          "INSERT INTO audit_log (id, payload, actor_account_id) VALUES ($1,$2::jsonb,$3)",
          [auditId, JSON.stringify(audit), input.accountId],
        );
        const event = {
          id: input.growthEventId,
          actorId: input.accountId,
          name: "booking.created",
          metadata: { category: professional.role, zone: booking.place },
          occurredAt: input.createdAt,
        };
        await client.query(
          "INSERT INTO growth_events (id, payload, actor_account_id, occurred_at) VALUES ($1,$2::jsonb,$3,$4)",
          [event.id, JSON.stringify(event), event.actorId, event.occurredAt],
        );
        if (input.idempotency)
          await client.query(
            "INSERT INTO idempotency_keys (account_id, key, method, path, response_status, response_body) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
            [
              input.accountId,
              input.idempotency.key,
              input.idempotency.method,
              input.idempotency.path,
              201,
              JSON.stringify(booking),
            ],
          );
        await client.query("COMMIT");
        return { booking };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    listForClient(clientId) {
      return list("client_account_id", clientId);
    },
    listForProfessional(professionalId) {
      return list("professional_id", professionalId);
    },
  };
}
