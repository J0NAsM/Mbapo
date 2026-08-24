export function createWalletRepository(pool) {
  if (!pool) return null;
  return {
    async requestDemoWithdrawal(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (input.idempotency) {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
            [
              input.idempotency.accountId,
              `${input.idempotency.key}:${input.idempotency.method}:${input.idempotency.path}`,
            ],
          );
          const existing = await client.query(
            "SELECT response_status, response_body FROM idempotency_keys WHERE account_id = $1 AND key = $2 AND method = $3 AND path = $4 AND created_at > now() - interval '24 hours'",
            [
              input.idempotency.accountId,
              input.idempotency.key,
              input.idempotency.method,
              input.idempotency.path,
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
        const profileResult = await client.query(
          "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
          [input.accountId],
        );
        const profile = profileResult.rows[0]?.payload;
        if (!profile) {
          await client.query("COMMIT");
          return { error: "profile" };
        }
        if (input.amount > Number(profile.balance || 0)) {
          await client.query("COMMIT");
          return { error: "balance" };
        }
        await client.query("LOCK TABLE transactions IN EXCLUSIVE MODE");
        const transactionId = Number(
          (
            await client.query(
              "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM transactions",
            )
          ).rows[0].id,
        );
        const nextProfile = {
          ...profile,
          balance: Number(profile.balance || 0) - input.amount,
        };
        const transaction = {
          id: transactionId,
          userId: input.accountId,
          name: "Retiro de demostración solicitado",
          description: "No se transfiere dinero real",
          amount: -input.amount,
          status: "En proceso",
        };
        await client.query(
          "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
          [input.accountId, JSON.stringify(nextProfile)],
        );
        await client.query(
          "INSERT INTO transactions (id, payload, account_id) VALUES ($1,$2::jsonb,$3)",
          [transaction.id, JSON.stringify(transaction), input.accountId],
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
              actorId: input.accountId,
              action: "withdrawal.requested",
              entity: "withdrawal",
              entityId: String(transaction.id),
              metadata: {},
              createdAt: input.createdAt,
            }),
            input.accountId,
          ],
        );
        const body = { balance: nextProfile.balance };
        if (input.idempotency)
          await client.query(
            "INSERT INTO idempotency_keys (account_id, key, method, path, response_status, response_body) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (account_id, key, method, path) DO UPDATE SET response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body, created_at = now()",
            [
              input.idempotency.accountId,
              input.idempotency.key,
              input.idempotency.method,
              input.idempotency.path,
              201,
              JSON.stringify(body),
            ],
          );
        await client.query("COMMIT");
        return { body };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
