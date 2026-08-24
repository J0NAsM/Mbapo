export function createReviewsRepository(pool) {
  if (!pool) return null;
  return {
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
