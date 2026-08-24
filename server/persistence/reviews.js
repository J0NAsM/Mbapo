export function createReviewsRepository(pool) {
  if (!pool) return null;
  return {
    async createWithEffects(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const professionalResult = await client.query(
          "SELECT payload FROM professionals WHERE id = $1 FOR UPDATE",
          [input.professionalId],
        );
        const bookingResult = await client.query(
          "SELECT payload FROM bookings WHERE id = $1 AND client_account_id = $2 AND professional_id = $3 FOR SHARE",
          [input.bookingId, input.accountId, input.professionalId],
        );
        const professional = professionalResult.rows[0]?.payload;
        const booking = bookingResult.rows[0]?.payload;
        if (
          !professional ||
          !booking ||
          !["Finalizado", "Completada"].includes(booking.status)
        ) {
          await client.query("COMMIT");
          return { allowed: false };
        }
        await client.query("LOCK TABLE reviews IN EXCLUSIVE MODE");
        const existing = await client.query(
          "SELECT 1 FROM reviews WHERE booking_id = $1",
          [input.bookingId],
        );
        if (existing.rowCount) {
          await client.query("COMMIT");
          return { duplicate: true };
        }
        const reviewId = Number(
          (
            await client.query(
              "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM reviews",
            )
          ).rows[0].id,
        );
        const review = {
          id: reviewId,
          bookingId: input.bookingId,
          userId: input.accountId,
          professionalId: input.professionalId,
          author: input.author,
          rating: input.rating,
          comment: input.comment,
          createdAt: input.createdAt,
        };
        const nextProfessional = {
          ...professional,
          rating: Number(
            (
              (Number(professional.rating || 0) *
                Number(professional.jobs || 0) +
                review.rating) /
              (Number(professional.jobs || 0) + 1)
            ).toFixed(1),
          ),
          jobs: Number(professional.jobs || 0) + 1,
        };
        await client.query(
          "INSERT INTO reviews (id, payload, booking_id, account_id, professional_id) VALUES ($1,$2::jsonb,$3,$4,$5)",
          [
            review.id,
            JSON.stringify(review),
            review.bookingId,
            review.userId,
            review.professionalId,
          ],
        );
        await client.query(
          "UPDATE professionals SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
          [input.professionalId, JSON.stringify(nextProfessional)],
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
          action: "review.created",
          entity: "review",
          entityId: String(review.id),
          metadata: { bookingId: input.bookingId },
          createdAt: input.createdAt,
        };
        await client.query(
          "INSERT INTO audit_log (id, payload, actor_account_id) VALUES ($1, $2::jsonb, $3)",
          [audit.id, JSON.stringify(audit), input.accountId],
        );
        const event = {
          id: input.growthEventId,
          actorId: input.accountId,
          name: "review.created",
          metadata: { category: professional.role },
          occurredAt: input.createdAt,
        };
        await client.query(
          "INSERT INTO growth_events (id, payload, actor_account_id, occurred_at) VALUES ($1, $2::jsonb, $3, $4)",
          [event.id, JSON.stringify(event), event.actorId, event.occurredAt],
        );
        if (professional.ownerId)
          await client.query(
            "INSERT INTO notifications (id, account_id, type, title, body, read_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [
              input.notificationId,
              professional.ownerId,
              "review.created",
              "Nueva reseña recibida",
              `${input.author} dejó una calificación de ${review.rating}/5.`,
              null,
              input.createdAt,
            ],
          );
        await client.query("COMMIT");
        return { review };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async findPage(professionalId, page, limit) {
      const offset = (page - 1) * limit;
      const [professional, reviews, total] = await Promise.all([
        pool.query("SELECT 1 FROM professionals WHERE id = $1", [
          professionalId,
        ]),
        pool.query(
          "SELECT payload FROM reviews WHERE professional_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
          [professionalId, limit, offset],
        ),
        pool.query(
          "SELECT count(*)::int AS total FROM reviews WHERE professional_id = $1",
          [professionalId],
        ),
      ]);
      return {
        exists: professional.rowCount > 0,
        items: reviews.rows.map((row) => row.payload),
        total: total.rows[0].total,
      };
    },
  };
}
