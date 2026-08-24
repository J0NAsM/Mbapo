function payloads(result) {
  return result.rows.map((row) => row.payload);
}

export function createMessagesRepository(pool) {
  if (!pool) return null;
  return {
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
