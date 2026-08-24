export function createNotificationsRepository(pool) {
  if (!pool) return null;
  return {
    async create(notification) {
      await pool.query(
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
      return notification;
    },
    async list(accountId, limit) {
      const result = await pool.query(
        "SELECT id, account_id, type, title, body, read_at, created_at FROM notifications WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2",
        [accountId, limit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        type: row.type,
        title: row.title,
        body: row.body,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));
    },
    async markRead(id, accountId) {
      const result = await pool.query(
        "UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND account_id = $2 RETURNING id, account_id, type, title, body, read_at, created_at",
        [id, accountId],
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            accountId: row.account_id,
            type: row.type,
            title: row.title,
            body: row.body,
            readAt: row.read_at,
            createdAt: row.created_at,
          }
        : null;
    },
  };
}
