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
    async updateByAdmin(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const accountResult = await client.query(
          "SELECT id, name, email, role, verified, status, token_version, created_at FROM accounts WHERE id = $1 FOR UPDATE",
          [input.accountId],
        );
        const account = accountResult.rows[0];
        if (!account) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        const role = input.changes.role ?? account.role;
        const verified = input.changes.verified ?? account.verified;
        const status = input.changes.status ?? account.status;
        const tokenVersion =
          Number(account.token_version || 0) +
          (role !== account.role || status !== account.status ? 1 : 0);
        await client.query(
          "UPDATE accounts SET role = $2, verified = $3, status = $4, token_version = $5 WHERE id = $1",
          [input.accountId, role, verified, status, tokenVersion],
        );
        const profileResult = await client.query(
          "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
          [input.accountId],
        );
        if (profileResult.rows[0])
          await client.query(
            "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
            [
              input.accountId,
              JSON.stringify({
                ...profileResult.rows[0].payload,
                role,
                verified,
              }),
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
        await client.query(
          "INSERT INTO audit_log (id, payload, actor_account_id) VALUES ($1,$2::jsonb,$3)",
          [
            auditId,
            JSON.stringify({
              id: auditId,
              actorId: input.adminId,
              action: "user.updated",
              entity: "account",
              entityId: input.accountId,
              metadata: {
                ...input.changes,
                tokenVersionRotated: tokenVersion !== account.token_version,
              },
              createdAt: input.createdAt,
            }),
            input.adminId,
          ],
        );
        await client.query("COMMIT");
        return {
          user: {
            id: account.id,
            name: account.name,
            email: account.email,
            role,
            verified,
            status,
            tokenVersion,
            createdAt: account.created_at,
          },
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
