import {
  availableBookingSlots,
  bookingOverlaps,
  bookingRange,
  isProfessionalAvailable,
} from "../domain/availability.js";

export function createBookingsRepository(pool) {
  if (!pool) return null;
  const replayIdempotency = async (client, idempotency) => {
    if (!idempotency) return null;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [
        idempotency.accountId,
        `${idempotency.key}:${idempotency.method}:${idempotency.path}`,
      ],
    );
    const existing = await client.query(
      "SELECT response_status, response_body FROM idempotency_keys WHERE account_id = $1 AND key = $2 AND method = $3 AND path = $4 AND created_at > now() - interval '24 hours'",
      [
        idempotency.accountId,
        idempotency.key,
        idempotency.method,
        idempotency.path,
      ],
    );
    return existing.rows[0]
      ? {
          replayed: true,
          status: existing.rows[0].response_status,
          body: existing.rows[0].response_body,
        }
      : null;
  };
  const rememberIdempotency = async (client, idempotency, status, body) => {
    if (!idempotency) return;
    await client.query(
      "INSERT INTO idempotency_keys (account_id, key, method, path, response_status, response_body) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (account_id, key, method, path) DO UPDATE SET response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body, created_at = now()",
      [
        idempotency.accountId,
        idempotency.key,
        idempotency.method,
        idempotency.path,
        status,
        JSON.stringify(body),
      ],
    );
  };
  const nextTransactionId = async (client) => {
    await client.query("LOCK TABLE transactions IN EXCLUSIVE MODE");
    return Number(
      (
        await client.query(
          "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM transactions",
        )
      ).rows[0].id,
    );
  };
  const appendAudit = async (client, audit) => {
    await client.query("LOCK TABLE audit_log IN EXCLUSIVE MODE");
    const id = Number(
      (
        await client.query(
          "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM audit_log",
        )
      ).rows[0].id,
    );
    await client.query(
      "INSERT INTO audit_log (id, payload, actor_account_id) VALUES ($1,$2::jsonb,$3)",
      [id, JSON.stringify({ ...audit, id }), audit.actorId || null],
    );
  };
  const insertNotification = async (client, notification) => {
    if (!notification?.accountId) return;
    await client.query(
      "INSERT INTO notifications (id, account_id, type, title, body, read_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        notification.id,
        notification.accountId,
        notification.type,
        notification.title,
        notification.body,
        notification.readAt || null,
        notification.createdAt,
      ],
    );
  };
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
        const replay = await replayIdempotency(client, input.idempotency);
        if (replay) {
          await client.query("COMMIT");
          return replay;
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
        await rememberIdempotency(client, input.idempotency, 201, booking);
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
    async availableSlots(professionalId, date) {
      const [professional, bookings] = await Promise.all([
        pool.query("SELECT payload FROM professionals WHERE id = $1", [
          professionalId,
        ]),
        pool.query(
          "SELECT payload FROM bookings WHERE professional_id = $1 AND payload->>'date' = $2",
          [professionalId, date],
        ),
      ]);
      const payload = professional.rows[0]?.payload;
      if (!payload?.available) return { error: "professional" };
      return {
        slots: availableBookingSlots(
          payload,
          date,
          bookings.rows.map((row) => row.payload),
        ),
      };
    },
    async authorizeDemoPayment(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const replay = await replayIdempotency(client, input.idempotency);
        if (replay) {
          await client.query("COMMIT");
          return replay;
        }
        const bookingResult = await client.query(
          "SELECT payload FROM bookings WHERE id = $1 AND client_account_id = $2 FOR UPDATE",
          [input.bookingId, input.accountId],
        );
        const booking = bookingResult.rows[0]?.payload;
        if (!booking) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        if (booking.status !== "Profesional confirmado") {
          await client.query("COMMIT");
          return { error: "status" };
        }
        if (booking.paymentIntentId || booking.paymentStatus !== "unpaid") {
          await client.query("COMMIT");
          return { error: "payment" };
        }
        const profileResult = await client.query(
          "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
          [input.accountId],
        );
        const profile = profileResult.rows[0]?.payload;
        if (!profile) {
          await client.query("COMMIT");
          return { error: "profile" };
        }
        const professionalResult = await client.query(
          "SELECT payload FROM professionals WHERE id = $1 FOR SHARE",
          [booking.professionalId],
        );
        const professional = professionalResult.rows[0]?.payload;
        const nextBooking = {
          ...booking,
          paymentStatus: "demo_authorized",
          timeline: [
            ...(booking.timeline || []),
            { status: "Pago demo autorizado", at: input.createdAt },
          ],
        };
        const nextProfile = {
          ...profile,
          escrow: Number(profile.escrow || 0) + Number(booking.amount || 0),
        };
        const transactionId = await nextTransactionId(client);
        const transaction = {
          id: transactionId,
          userId: input.accountId,
          name: "Pago protegido (demo)",
          description: booking.title,
          amount: -Number(booking.amount || 0),
          status: "Autorizado",
        };
        await client.query(
          "UPDATE bookings SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
          [booking.id, JSON.stringify(nextBooking)],
        );
        await client.query(
          "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
          [input.accountId, JSON.stringify(nextProfile)],
        );
        await client.query(
          "INSERT INTO transactions (id, payload, account_id) VALUES ($1,$2::jsonb,$3)",
          [transaction.id, JSON.stringify(transaction), input.accountId],
        );
        await insertNotification(
          client,
          professional?.ownerId
            ? {
                ...input.notification,
                accountId: professional.ownerId,
              }
            : null,
        );
        const body = { demo: true, paymentStatus: nextBooking.paymentStatus };
        await rememberIdempotency(client, input.idempotency, 201, body);
        await client.query("COMMIT");
        return { body };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async releaseDemoPayment(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const replay = await replayIdempotency(client, input.idempotency);
        if (replay) {
          await client.query("COMMIT");
          return replay;
        }
        const bookingResult = await client.query(
          "SELECT payload FROM bookings WHERE id = $1 AND client_account_id = $2 FOR UPDATE",
          [input.bookingId, input.accountId],
        );
        const booking = bookingResult.rows[0]?.payload;
        if (!booking) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        if (booking.status !== "Finalizado") {
          await client.query("COMMIT");
          return { error: "status" };
        }
        if (booking.paymentStatus !== "demo_authorized") {
          await client.query("COMMIT");
          return { error: "payment" };
        }
        const clientProfileResult = await client.query(
          "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
          [input.accountId],
        );
        const clientProfile = clientProfileResult.rows[0]?.payload;
        if (!clientProfile) {
          await client.query("COMMIT");
          return { error: "profile" };
        }
        const professionalResult = await client.query(
          "SELECT payload FROM professionals WHERE id = $1 FOR SHARE",
          [booking.professionalId],
        );
        const professional = professionalResult.rows[0]?.payload;
        const professionalAccountId = professional?.ownerId;
        let professionalProfile = null;
        if (professionalAccountId) {
          const profileResult = await client.query(
            "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
            [professionalAccountId],
          );
          professionalProfile = profileResult.rows[0]?.payload || null;
        }
        const platformResult = await client.query(
          "SELECT payload FROM platform_settings WHERE id = 1 FOR SHARE",
        );
        const commission = Math.round(
          (Number(booking.amount || 0) *
            Number(platformResult.rows[0]?.payload?.commissionRate || 0)) /
            100,
        );
        const payout = Number(booking.amount || 0) - commission;
        const nextBooking = {
          ...booking,
          paymentStatus: "demo_paid",
          status: "Completada",
          timeline: [
            ...(booking.timeline || []),
            {
              status: "Pago demo liberado",
              at: input.createdAt,
              by: input.accountId,
            },
          ],
        };
        const nextClientProfile = {
          ...clientProfile,
          escrow: Math.max(
            0,
            Number(clientProfile.escrow || 0) - Number(booking.amount || 0),
          ),
        };
        const transactionId = await nextTransactionId(client);
        const clientTransaction = {
          id: transactionId,
          userId: input.accountId,
          name: "Pago protegido liberado (demo)",
          description: booking.title,
          amount: 0,
          status: "Liberado",
        };
        const professionalTransaction = professionalProfile
          ? {
              id: transactionId + 1,
              userId: professionalAccountId,
              name: "Cobro por servicio (demo)",
              description: booking.title,
              amount: payout,
              status: "Disponible",
            }
          : null;
        await client.query(
          "UPDATE bookings SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
          [booking.id, JSON.stringify(nextBooking)],
        );
        await client.query(
          "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
          [input.accountId, JSON.stringify(nextClientProfile)],
        );
        if (professionalProfile)
          await client.query(
            "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
            [
              professionalAccountId,
              JSON.stringify({
                ...professionalProfile,
                balance: Number(professionalProfile.balance || 0) + payout,
              }),
            ],
          );
        await client.query(
          "INSERT INTO transactions (id, payload, account_id) VALUES ($1,$2::jsonb,$3)",
          [
            clientTransaction.id,
            JSON.stringify(clientTransaction),
            input.accountId,
          ],
        );
        if (professionalTransaction)
          await client.query(
            "INSERT INTO transactions (id, payload, account_id) VALUES ($1,$2::jsonb,$3)",
            [
              professionalTransaction.id,
              JSON.stringify(professionalTransaction),
              professionalAccountId,
            ],
          );
        await appendAudit(client, {
          actorId: input.accountId,
          action: "payment.demo_released",
          entity: "booking",
          entityId: String(booking.id),
          metadata: {
            amount: Number(booking.amount || 0),
            professionalId: booking.professionalId,
          },
          createdAt: input.createdAt,
        });
        await insertNotification(
          client,
          professionalAccountId
            ? { ...input.notification, accountId: professionalAccountId }
            : null,
        );
        const body = { demo: true, status: nextBooking.paymentStatus };
        await rememberIdempotency(client, input.idempotency, 200, body);
        await client.query("COMMIT");
        return { body };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async transitionForProfessional(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const replay = await replayIdempotency(client, input.idempotency);
        if (replay) {
          await client.query("COMMIT");
          return replay;
        }
        const bookingResult = await client.query(
          "SELECT payload FROM bookings WHERE id = $1 AND professional_id = $2 FOR UPDATE",
          [input.bookingId, input.professionalId],
        );
        const booking = bookingResult.rows[0]?.payload;
        if (!booking) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        const allowedTransitions = {
          "Esperando respuesta": ["Profesional confirmado", "Cancelada"],
          "Profesional confirmado": ["Trabajo en curso", "Cancelada"],
          "Trabajo en curso": ["Esperando tu confirmación"],
        };
        if (
          !(allowedTransitions[booking.status] || []).includes(input.status)
        ) {
          await client.query("COMMIT");
          return { error: "transition" };
        }
        if (
          ["Trabajo en curso", "Esperando tu confirmación"].includes(
            input.status,
          ) &&
          !["authorized", "demo_authorized"].includes(booking.paymentStatus)
        ) {
          await client.query("COMMIT");
          return { error: "payment_required" };
        }
        if (
          input.status === "Cancelada" &&
          booking.paymentStatus !== "unpaid"
        ) {
          await client.query("COMMIT");
          return { error: "authorized_payment" };
        }
        const nextBooking = {
          ...booking,
          status: input.status,
          timeline: [
            ...(booking.timeline || []),
            { status: input.status, at: input.createdAt, by: input.accountId },
          ],
        };
        await client.query(
          "UPDATE bookings SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
          [booking.id, JSON.stringify(nextBooking)],
        );
        await appendAudit(client, {
          actorId: input.accountId,
          action: "booking.status_changed",
          entity: "booking",
          entityId: String(booking.id),
          metadata: { status: input.status, actor: "professional" },
          createdAt: input.createdAt,
        });
        await insertNotification(client, {
          ...input.notification,
          accountId: booking.clientId,
        });
        await rememberIdempotency(client, input.idempotency, 200, nextBooking);
        await client.query("COMMIT");
        return { booking: nextBooking };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async transitionForClient(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const replay = await replayIdempotency(client, input.idempotency);
        if (replay) {
          await client.query("COMMIT");
          return replay;
        }
        const bookingResult = await client.query(
          "SELECT payload FROM bookings WHERE id = $1 AND client_account_id = $2 FOR UPDATE",
          [input.bookingId, input.accountId],
        );
        const booking = bookingResult.rows[0]?.payload;
        if (!booking) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        const allowedTransitions = {
          "Esperando respuesta": ["Cancelada"],
          "Profesional confirmado": ["Cancelada"],
          "Esperando tu confirmación": ["Finalizado", "Disputa abierta"],
        };
        if (
          !(allowedTransitions[booking.status] || []).includes(input.status)
        ) {
          await client.query("COMMIT");
          return { error: "transition" };
        }
        if (
          input.status === "Finalizado" &&
          !["authorized", "demo_authorized"].includes(booking.paymentStatus)
        ) {
          await client.query("COMMIT");
          return { error: "payment_required" };
        }
        const professionalResult = await client.query(
          "SELECT payload FROM professionals WHERE id = $1 FOR SHARE",
          [booking.professionalId],
        );
        const professional = professionalResult.rows[0]?.payload;
        const nextBooking = {
          ...booking,
          status: input.status,
          timeline: [
            ...(booking.timeline || []),
            { status: input.status, at: input.createdAt },
          ],
        };
        await client.query(
          "UPDATE bookings SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
          [booking.id, JSON.stringify(nextBooking)],
        );
        await appendAudit(client, {
          actorId: input.accountId,
          action: "booking.status_changed",
          entity: "booking",
          entityId: String(booking.id),
          metadata: { status: input.status },
          createdAt: input.createdAt,
        });
        if (input.status === "Finalizado") {
          const profileResult = await client.query(
            "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
            [input.accountId],
          );
          const profile = profileResult.rows[0]?.payload;
          if (
            profile?.referredBy &&
            profile.referralRewardStatus !== "qualified"
          ) {
            const referrerResult = await client.query(
              "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
              [profile.referredBy],
            );
            const referrer = referrerResult.rows[0]?.payload;
            if (referrer) {
              const qualifiedProfile = {
                ...profile,
                referralRewardStatus: "qualified",
                referralQualifiedAt: input.createdAt,
              };
              const qualifiedReferrer = {
                ...referrer,
                referralQualifiedCount:
                  Number(referrer.referralQualifiedCount || 0) + 1,
              };
              await client.query(
                "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
                [input.accountId, JSON.stringify(qualifiedProfile)],
              );
              await client.query(
                "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
                [profile.referredBy, JSON.stringify(qualifiedReferrer)],
              );
              await client.query(
                "INSERT INTO growth_events (id, payload, actor_account_id, occurred_at) VALUES ($1,$2::jsonb,$3,$4)",
                [
                  input.growthEventId,
                  JSON.stringify({
                    id: input.growthEventId,
                    actorId: input.accountId,
                    name: "referral.qualified",
                    metadata: { referrerId: referrer.id },
                    occurredAt: input.createdAt,
                  }),
                  input.accountId,
                  input.createdAt,
                ],
              );
            }
          }
        }
        await insertNotification(
          client,
          professional?.ownerId
            ? { ...input.notification, accountId: professional.ownerId }
            : null,
        );
        await rememberIdempotency(client, input.idempotency, 200, nextBooking);
        await client.query("COMMIT");
        return { booking: nextBooking };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async transitionForAdmin(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const replay = await replayIdempotency(client, input.idempotency);
        if (replay) {
          await client.query("COMMIT");
          return replay;
        }
        const bookingResult = await client.query(
          "SELECT payload FROM bookings WHERE id = $1 FOR UPDATE",
          [input.bookingId],
        );
        const booking = bookingResult.rows[0]?.payload;
        if (!booking) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        const allowed = [
          "Profesional confirmado",
          "Trabajo en curso",
          "Esperando tu confirmación",
          "Cancelada",
        ];
        if (!allowed.includes(input.status)) {
          await client.query("COMMIT");
          return { error: "status" };
        }
        if (
          input.status === "Esperando tu confirmación" &&
          !["authorized", "demo_authorized"].includes(booking.paymentStatus)
        ) {
          await client.query("COMMIT");
          return { error: "payment_required" };
        }
        const nextBooking = {
          ...booking,
          status: input.status,
          timeline: [
            ...(booking.timeline || []),
            { status: input.status, at: input.createdAt, by: input.adminId },
          ],
        };
        await client.query(
          "UPDATE bookings SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
          [booking.id, JSON.stringify(nextBooking)],
        );
        await appendAudit(client, {
          actorId: input.adminId,
          action: "booking.status_changed",
          entity: "booking",
          entityId: String(booking.id),
          metadata: { status: input.status },
          createdAt: input.createdAt,
        });
        await rememberIdempotency(client, input.idempotency, 200, nextBooking);
        await client.query("COMMIT");
        return { booking: nextBooking };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
