export function createAccountsRepository(pool) {
  if (!pool) return null;
  return {
    async findPage({ query, page, limit }) {
      const offset = (page - 1) * limit;
      const values = [];
      let where = "";
      if (query) {
        values.push(`%${query}%`);
        where =
          "WHERE name ILIKE $1 OR email ILIKE $1 OR role ILIKE $1 OR status ILIKE $1";
      }
      const pageParameters = [...values, limit, offset];
      const limitIndex = `$${values.length + 1}`;
      const offsetIndex = `$${values.length + 2}`;
      const [items, total] = await Promise.all([
        pool.query(
          `SELECT id, name, email, role, verified, status, token_version, created_at FROM accounts ${where} ORDER BY created_at DESC, id DESC LIMIT ${limitIndex} OFFSET ${offsetIndex}`,
          pageParameters,
        ),
        pool.query(
          `SELECT count(*)::int AS total FROM accounts ${where}`,
          values,
        ),
      ]);
      return {
        items: items.rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          verified: row.verified,
          status: row.status,
          tokenVersion: row.token_version,
          createdAt: row.created_at,
        })),
        total: total.rows[0].total,
      };
    },
  };
}
