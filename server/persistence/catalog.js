const distanceExpression =
  "COALESCE(NULLIF(regexp_replace(COALESCE(payload->>'distance', ''), '[^0-9.]', '', 'g'), '')::numeric, 9999999)";

function pageValues(page, limit) {
  return { limit, offset: (page - 1) * limit };
}

export function createCatalogRepository(pool) {
  if (!pool) return null;
  return {
    async professionals({
      terms,
      maxPrice,
      maxDistance,
      minRating,
      verified,
      available,
      sort,
      direction,
      page,
      limit,
    }) {
      const conditions = ["COALESCE(payload->>'archivedAt', '') = ''"];
      const values = [];
      const add = (condition, value) => {
        values.push(value);
        conditions.push(condition.replace("?", `$${values.length}`));
      };
      for (const term of terms) add("payload::text ILIKE ?", `%${term}%`);
      if (Number.isFinite(maxPrice))
        add("(payload->>'price')::numeric <= ?", maxPrice);
      if (Number.isFinite(maxDistance))
        add(`${distanceExpression} <= ?`, maxDistance);
      if (minRating)
        add("COALESCE((payload->>'rating')::numeric, 0) >= ?", minRating);
      if (verified)
        conditions.push("COALESCE((payload->>'verified')::boolean, false)");
      if (available)
        conditions.push("COALESCE((payload->>'available')::boolean, false)");
      const orderBy = {
        rating: "COALESCE((payload->>'rating')::numeric, 0)",
        price: "COALESCE((payload->>'price')::numeric, 0)",
        distance: distanceExpression,
        name: "payload->>'name'",
      }[sort];
      const where = conditions.join(" AND ");
      const { offset } = pageValues(page, limit);
      const [items, total] = await Promise.all([
        pool.query(
          `SELECT payload FROM professionals WHERE ${where} ORDER BY ${orderBy} ${direction === "asc" ? "ASC" : "DESC"}, id ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, limit, offset],
        ),
        pool.query(
          `SELECT count(*)::int AS total FROM professionals WHERE ${where}`,
          values,
        ),
      ]);
      return {
        items: items.rows.map((row) => row.payload),
        total: total.rows[0].total,
      };
    },
    async jobs({ category, sort, page, limit }) {
      const conditions = ["COALESCE(payload->>'status', '') <> 'archived'"];
      const values = [];
      if (category) {
        values.push(category);
        conditions.push(`payload->>'category' = $${values.length}`);
      }
      const orderBy =
        sort === "budget"
          ? "COALESCE(NULLIF(regexp_replace(COALESCE(payload->>'budget', ''), '[^0-9]', '', 'g'), '')::numeric, 0)"
          : "COALESCE((payload->>'createdAt')::timestamptz, created_at)";
      const where = conditions.join(" AND ");
      const { offset } = pageValues(page, limit);
      const [items, total] = await Promise.all([
        pool.query(
          `SELECT payload FROM jobs WHERE ${where} ORDER BY ${orderBy} DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, limit, offset],
        ),
        pool.query(
          `SELECT count(*)::int AS total FROM jobs WHERE ${where}`,
          values,
        ),
      ]);
      return {
        items: items.rows.map((row) => row.payload),
        total: total.rows[0].total,
      };
    },
    async setProfessionalOwner(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("LOCK TABLE professionals IN EXCLUSIVE MODE");
        const professionalResult = await client.query(
          "SELECT payload FROM professionals WHERE id = $1 FOR UPDATE",
          [input.professionalId],
        );
        const professional = professionalResult.rows[0]?.payload;
        if (!professional) {
          await client.query("COMMIT");
          return { error: "professional" };
        }
        let account = null;
        if (input.accountId) {
          const accountResult = await client.query(
            "SELECT id, role FROM accounts WHERE id = $1 FOR SHARE",
            [input.accountId],
          );
          account = accountResult.rows[0];
          if (!account) {
            await client.query("COMMIT");
            return { error: "account" };
          }
          if (account.role !== "professional") {
            await client.query("COMMIT");
            return { error: "role" };
          }
          const duplicate = await client.query(
            "SELECT 1 FROM professionals WHERE owner_account_id = $1 AND id <> $2",
            [account.id, input.professionalId],
          );
          if (duplicate.rowCount) {
            await client.query("COMMIT");
            return { error: "owned" };
          }
        }
        const nextProfessional = {
          ...professional,
          ownerId: account?.id || null,
        };
        await client.query(
          "UPDATE professionals SET payload = $2::jsonb, owner_account_id = $3, updated_at = now() WHERE id = $1",
          [
            input.professionalId,
            JSON.stringify(nextProfessional),
            account?.id || null,
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
              action: "professional.owner_changed",
              entity: "professional",
              entityId: String(input.professionalId),
              metadata: { accountId: account?.id || null },
              createdAt: input.createdAt,
            }),
            input.adminId,
          ],
        );
        await client.query("COMMIT");
        return {
          professional: {
            id: input.professionalId,
            ownerId: account?.id || null,
          },
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async onboardProfessional(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("LOCK TABLE professionals IN EXCLUSIVE MODE");
        const accountResult = await client.query(
          "SELECT id, name, email, role, verified, status, token_version, created_at FROM accounts WHERE id = $1 FOR UPDATE",
          [input.accountId],
        );
        const account = accountResult.rows[0];
        if (!account) {
          await client.query("COMMIT");
          return { error: "account" };
        }
        const existingResult = await client.query(
          "SELECT id, payload FROM professionals WHERE owner_account_id = $1 AND (payload->>'archivedAt' IS NULL OR payload->>'archivedAt' = '') FOR UPDATE",
          [input.accountId],
        );
        const existing = existingResult.rows[0];
        if (existing) {
          const professional = {
            ...existing.payload,
            ...input.details,
            available: true,
            initials: existing.payload.initials || input.initials,
            color: existing.payload.color || "#4f8c78",
          };
          await client.query(
            "UPDATE professionals SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
            [existing.id, JSON.stringify(professional)],
          );
          await client.query("COMMIT");
          return {
            created: false,
            professional,
            user: {
              id: account.id,
              name: account.name,
              email: account.email,
              role: account.role,
              verified: account.verified,
              status: account.status,
              tokenVersion: account.token_version,
              createdAt: account.created_at,
            },
          };
        }
        if (account.role !== "client") {
          await client.query("COMMIT");
          return { error: "role" };
        }
        const profileResult = await client.query(
          "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
          [input.accountId],
        );
        const profile = profileResult.rows[0]?.payload;
        const id = Number(
          (
            await client.query(
              "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM professionals",
            )
          ).rows[0].id,
        );
        const professional = {
          id,
          ownerId: input.accountId,
          name: profile?.name || account.name,
          initials: input.initials,
          color: "#4f8c78",
          rating: 0,
          jobs: 0,
          verified: false,
          available: true,
          distance: "Zona a definir",
          ...input.details,
          createdAt: input.createdAt,
        };
        const tokenVersion = Number(account.token_version || 0) + 1;
        await client.query(
          "INSERT INTO professionals (id, payload, owner_account_id) VALUES ($1,$2::jsonb,$3)",
          [id, JSON.stringify(professional), input.accountId],
        );
        await client.query(
          "UPDATE accounts SET role = 'professional', token_version = $2 WHERE id = $1",
          [input.accountId, tokenVersion],
        );
        if (profile)
          await client.query(
            "UPDATE user_profiles SET payload = $2::jsonb, updated_at = now() WHERE account_id = $1",
            [
              input.accountId,
              JSON.stringify({ ...profile, role: "professional" }),
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
              actorId: input.accountId,
              action: "professional.onboarded",
              entity: "professional",
              entityId: String(id),
              metadata: {},
              createdAt: input.createdAt,
            }),
            input.accountId,
          ],
        );
        await client.query("COMMIT");
        return {
          created: true,
          professional,
          user: {
            id: account.id,
            name: account.name,
            email: account.email,
            role: "professional",
            verified: account.verified,
            status: account.status,
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
    async updateOwnAvailability(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const professionalResult = await client.query(
          "SELECT id, payload FROM professionals WHERE owner_account_id = $1 AND (payload->>'archivedAt' IS NULL OR payload->>'archivedAt' = '') FOR UPDATE",
          [input.accountId],
        );
        const professional = professionalResult.rows[0];
        if (!professional) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        const nextProfessional = {
          ...professional.payload,
          availability: input.availability,
        };
        await client.query(
          "UPDATE professionals SET payload = $2::jsonb, updated_at = now() WHERE id = $1",
          [professional.id, JSON.stringify(nextProfessional)],
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
              action: "professional.availability_updated",
              entity: "professional",
              entityId: String(professional.id),
              metadata: {},
              createdAt: input.createdAt,
            }),
            input.accountId,
          ],
        );
        await client.query("COMMIT");
        return { availability: input.availability };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
