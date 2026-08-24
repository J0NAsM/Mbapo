import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function applyMigrations(pool, root) {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const migrationsPath = join(root, "database", "migrations");
  const migrationFiles = await readdir(migrationsPath).catch(() => []);
  const migrations = [
    {
      name: "001_initial",
      sql: await readFile(join(root, "database", "schema.sql"), "utf8"),
    },
    ...(await Promise.all(
      migrationFiles
        .filter((file) => file.endsWith(".sql"))
        .sort()
        .map(async (file) => ({
          name: file.replace(/\.sql$/, ""),
          sql: await readFile(join(migrationsPath, file), "utf8"),
        })),
    )),
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const applied = await client.query("SELECT name FROM schema_migrations");
    const appliedNames = new Set(applied.rows.map((row) => row.name));
    for (const migration of migrations) {
      if (appliedNames.has(migration.name)) continue;
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        migration.name,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
