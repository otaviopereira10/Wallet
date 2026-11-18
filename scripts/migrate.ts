/**
 * Applies the SQL migrations in supabase/migrations to the database in
 * DATABASE_URL (e.g. your Supabase project). Safe to run repeatedly: applied
 * migrations are recorded in app_meta.migrations.
 *
 *   DATABASE_URL="postgresql://..." npm run db:migrate
 *
 * On Vercel this runs automatically before every build (`vercel-build`), so
 * new migrations are applied when you deploy.
 */
import postgres from "postgres";
import { databaseUrl } from "../src/lib/supabase-env";
import { applyMigrations, readMigrationFiles } from "../src/server/db/migrations";

async function main() {
  const url = databaseUrl();
  if (!url && process.argv.includes("--if-configured")) {
    // Used by `vercel-build`: without a database there is nothing to migrate.
    // The deployed app then shows a "Setup required" page listing what is missing.
    console.warn("DATABASE_URL is not set — skipping database migrations.");
    return;
  }
  if (!url) {
    console.error("DATABASE_URL (or POSTGRES_URL) is not set. Copy .env.example to .env.local and fill it in, or export the variable.");
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const applied = await applyMigrations(
      {
        exec: async (text) => void (await sql.unsafe(text)),
        query: async (text, params) => [...(await sql.unsafe(text, (params ?? []) as never[]))] as never,
      },
      readMigrationFiles(),
    );
    console.log(applied.length ? `Migrations applied: ${applied.join(", ")}` : "Database is already up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Failed to apply migrations:", err instanceof Error ? err.message : err);
  process.exit(1);
});
