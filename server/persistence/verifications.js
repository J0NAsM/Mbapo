function pageOffset(page, limit) {
  return (page - 1) * limit;
}

export function createVerificationsRepository(pool) {
  if (!pool) return null;
  return {
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
