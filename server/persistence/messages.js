function payloads(result) {
  return result.rows.map((row) => row.payload);
}

export function createMessagesRepository(pool) {
  if (!pool) return null;
  return {
    async createWithEffects({ message, notification, audit, idempotency }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (idempotency) {
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
          if (existing.rows[0]) {
            await client.query("COMMIT");
            return {
              replayed: true,
              status: existing.rows[0].response_status,
              body: existing.rows[0].response_body,
            };
          }
        }
        await client.query("LOCK TABLE messages IN EXCLUSIVE MODE");
        const id = Number(
          (
            await client.query(
              "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM messages",
            )
          ).rows[0].id,
        );
        const saved = { ...message, id };
        await client.query(
          "INSERT INTO messages (id, payload, client_account_id, professional_id) VALUES ($1, $2::jsonb, $3, $4)",
          [id, JSON.stringify(saved), saved.clientId, saved.professionalId],
        );
        if (notification?.accountId)
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
        if (audit) {
          await client.query("LOCK TABLE audit_log IN EXCLUSIVE MODE");
          const auditId = Number(
            (
              await client.query(
                "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM audit_log",
              )
            ).rows[0].id,
          );
          const auditEntry = {
            ...audit,
            id: auditId,
            entityId: String(saved.id),
          };
          await client.query(
            "INSERT INTO audit_log (id, payload, actor_account_id) VALUES ($1, $2::jsonb, $3)",
            [auditId, JSON.stringify(auditEntry), audit.actorId || null],
          );
        }
        if (idempotency)
          await client.query(
            "INSERT INTO idempotency_keys (account_id, key, method, path, response_status, response_body) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
            [
              idempotency.accountId,
              idempotency.key,
              idempotency.method,
              idempotency.path,
              idempotency.status,
              JSON.stringify(saved),
            ],
          );
        await client.query("COMMIT");
        return { message: saved };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listThread(professionalId, clientId) {
      return payloads(
        await pool.query(
          "SELECT payload FROM messages WHERE professional_id = $1 AND client_account_id = $2 ORDER BY id",
          [professionalId, clientId],
        ),
      );
    },
    async listForClient(clientId) {
      return payloads(
        await pool.query(
          "SELECT payload FROM messages WHERE client_account_id = $1 ORDER BY id",
          [clientId],
        ),
      );
    },
    async listForProfessional(professionalId) {
      return payloads(
        await pool.query(
          "SELECT payload FROM messages WHERE professional_id = $1 ORDER BY id",
          [professionalId],
        ),
      );
    },
    async markReadByClient(id, clientId) {
      const result = await pool.query(
        "UPDATE messages SET payload = jsonb_set(payload, '{readAt}', to_jsonb(now()::text), true) WHERE id = $1 AND client_account_id = $2 AND payload->>'author' = 'professional' RETURNING payload",
        [id, clientId],
      );
      return result.rows[0]?.payload || null;
    },
    async markReadByProfessional(id, professionalId) {
      const result = await pool.query(
        "UPDATE messages SET payload = jsonb_set(payload, '{readAt}', to_jsonb(now()::text), true) WHERE id = $1 AND professional_id = $2 AND payload->>'author' = 'client' RETURNING payload",
        [id, professionalId],
      );
      return result.rows[0]?.payload || null;
    },
  };
}
