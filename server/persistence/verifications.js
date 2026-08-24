function pageOffset(page, limit) {
  return (page - 1) * limit;
}

export function createVerificationsRepository(pool) {
  if (!pool) return null;
  return {
    async createWithNotifications({ request, notifications }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("LOCK TABLE verifications IN EXCLUSIVE MODE");
        const pending = await client.query(
          "SELECT 1 FROM verifications WHERE account_id = $1 AND payload->>'kind' = $2 AND payload->>'status' = 'pending'",
          [request.userId, request.kind],
        );
        if (pending.rowCount) {
          await client.query("COMMIT");
          return { duplicate: true };
        }
        const id = Number(
          (
            await client.query(
              "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM verifications",
            )
          ).rows[0].id,
        );
        const saved = { ...request, id };
        await client.query(
          "INSERT INTO verifications (id, payload, account_id) VALUES ($1, $2::jsonb, $3)",
          [id, JSON.stringify(saved), saved.userId],
        );
        for (const notification of notifications)
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
        await client.query("COMMIT");
        return { request: saved };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listForUser(accountId) {
      const result = await pool.query(
        "SELECT payload FROM verifications WHERE account_id = $1 ORDER BY created_at DESC, id DESC",
        [accountId],
      );
      return result.rows.map((row) => row.payload);
    },
    async listForAdmin({ status, page, limit }) {
      const where = status ? "WHERE payload->>'status' = $1" : "";
      const values = status
        ? [status, limit, pageOffset(page, limit)]
        : [limit, pageOffset(page, limit)];
      const limitIndex = status ? "$2" : "$1";
      const offsetIndex = status ? "$3" : "$2";
      const [items, total] = await Promise.all([
        pool.query(
          `SELECT payload FROM verifications ${where} ORDER BY created_at DESC, id DESC LIMIT ${limitIndex} OFFSET ${offsetIndex}`,
          values,
        ),
        pool.query(
          `SELECT count(*)::int AS total FROM verifications ${where}`,
          status ? [status] : [],
        ),
      ]);
      return {
        items: items.rows.map((row) => row.payload),
        total: total.rows[0].total,
      };
    },
  };
}
