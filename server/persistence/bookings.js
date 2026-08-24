export function createBookingsRepository(pool) {
  if (!pool) return null;
  const list = async (column, value) => {
    const result = await pool.query(
      `SELECT payload FROM bookings WHERE ${column} = $1 ORDER BY id DESC`,
      [value],
    );
    return result.rows.map((row) => row.payload);
  };
  return {
    listForClient(clientId) {
      return list("client_account_id", clientId);
    },
    listForProfessional(professionalId) {
      return list("professional_id", professionalId);
    },
  };
}
