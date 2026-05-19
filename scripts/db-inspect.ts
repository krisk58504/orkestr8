/**
 * db-inspect.ts — connectivity + schema inspection for the DEV Supabase project.
 *
 * Reads DATABASE_URL from .env.local. Reports connection identity (database +
 * role + host only — never the password) and lists existing public-schema
 * objects so we can detect drift / pre-existing schema before applying any
 * migration. Read-only: issues no DDL/DML.
 *
 * Run: npx tsx scripts/db-inspect.ts
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("FATAL: DATABASE_URL is not set in .env.local");
  process.exit(1);
}

function hostOnly(connString: string): string {
  try {
    const u = new URL(connString);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

async function main() {
  console.log(`Target host: ${hostOnly(url!)}`);
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 15000,
  });
  await client.connect();

  const id = await client.query(
    "select current_database() as db, current_user as usr",
  );
  console.log(`Connected: database=${id.rows[0].db} role=${id.rows[0].usr}`);

  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  console.log(`\npublic BASE TABLES (${tables.rowCount}):`);
  for (const r of tables.rows) console.log(`  - ${r.table_name}`);

  const enums = await client.query(`
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typtype = 'e' and n.nspname = 'public'
    order by t.typname
  `);
  console.log(`\npublic ENUM types (${enums.rowCount}):`);
  for (const r of enums.rows) console.log(`  - ${r.typname}`);

  const migTable = await client.query(`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'schema_migrations'
    ) as has_mig
  `);
  console.log(`\nschema_migrations table present: ${migTable.rows[0].has_mig}`);

  await client.end();
  console.log("\nOK — inspection complete, no changes made.");
}

main().catch((e) => {
  console.error(`DB ERROR: ${e.message}`);
  process.exit(2);
});
