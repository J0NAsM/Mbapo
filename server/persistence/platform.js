export function createPlatformRepository(pool) {
  if (!pool) return null;
  return {
    async update(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT payload FROM platform_settings WHERE id = 1 FOR UPDATE",
        );
        await client.query(
          "INSERT INTO platform_settings (id, payload, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()",
          [JSON.stringify(input.platform)],
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
              action: "platform.updated",
              entity: "platform",
              entityId: "1",
              metadata: {},
              createdAt: input.createdAt,
            }),
            input.adminId,
          ],
        );
        await client.query("COMMIT");
        return { platform: input.platform };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
