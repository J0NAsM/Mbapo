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
  };
}
