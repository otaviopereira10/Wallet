/**
 * Applies the SQL migrations in supabase/migrations to the database in
 * DATABASE_URL (e.g. your Supabase project). Safe to run repeatedly: applied
 * migrations are recorded in app_meta.migrations.
 *
 *   DATABASE_URL="postgresql://..." npm run db:migrate
 */
import postgres from "postgres";
import { databaseUrl } from "../src/lib/supabase-env";
import { applyMigrations, readMigrationFiles } from "../src/server/db/migrations";

async function main() {
  const url = databaseUrl();
  if (!url) {
    console.error("DATABASE_URL (ou POSTGRES_URL) não definida. Copie .env.example para .env.local e preencha, ou exporte a variável.");
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
    console.log(applied.length ? `Migrations aplicadas: ${applied.join(", ")}` : "Banco já está atualizado.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Falha ao aplicar migrations:", err instanceof Error ? err.message : err);
  process.exit(1);
});
