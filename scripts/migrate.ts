/**
 * migrate.ts — applies SQL migrations to the DEV Supabase project.
 *
 * Reads DATABASE_URL from .env.local. Applies every file in
 * supabase/migrations/ (lexicographic order) that has not yet been recorded
 * in public.schema_migrations. Each file runs inside its own transaction;
 * a failure rolls that file back and stops.
 *
 * DEV ONLY. This script never receives production credentials — see SPEC.md
 * section 6 (enforcement model).
 *
 * Run: npm run db:migrate
 */
import { config } from "dotenv";
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("FATAL: DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function hostOnly(connString: string): string {
  try {
    const u = new URL(connString);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(unparseable connection string)";
  }
}

async function main() {
  console.log(`Migration target: ${hostOnly(url!)}`);
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  });
  await client.connect();

  await client.query(`
    create table if not exists public.schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set<string>(
    (await client.query("select version from public.schema_migrations")).rows.map(
      (r) => r.version as string,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip   ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`  apply  ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations(version) values ($1)", [
        file,
      ]);
      await client.query("commit");
      console.log("ok");
      appliedCount++;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log("FAILED");
      console.error(`\nMigration ${file} failed:\n  ${(e as Error).message}`);
      await client.end();
      process.exit(2);
    }
  }

  console.log(
    `\nDone. ${appliedCount} applied, ${files.length - appliedCount} already current.`,
  );
  await client.end();
}

main().catch((e) => {
  console.error(`Runner error: ${(e as Error).message}`);
  process.exit(2);
});
