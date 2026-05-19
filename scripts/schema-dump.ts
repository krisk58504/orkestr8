/**
 * schema-dump.ts — read-only introspection of the live dev schema.
 *
 * Prints every public table's columns (type, nullability, default), enum
 * types, RLS status, and policy counts. Used to verify src/lib/types/
 * database.ts against the actually-applied schema. Issues no DDL/DML.
 *
 * Run: npx tsx scripts/schema-dump.ts
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  });
  await client.connect();

  const cols = await client.query(`
    select table_name, column_name, data_type, udt_name,
           is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);

  let current = "";
  for (const r of cols.rows) {
    if (r.table_name !== current) {
      current = r.table_name;
      console.log(`\n# ${current}`);
    }
    const type = r.data_type === "USER-DEFINED" ? `enum:${r.udt_name}` : r.data_type;
    const nullable = r.is_nullable === "YES" ? "NULL" : "NOT NULL";
    const def = r.column_default ? ` default=${r.column_default}` : "";
    console.log(`  ${r.column_name}: ${type} ${nullable}${def}`);
  }

  const enums = await client.query(`
    select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname
  `);
  console.log("\n# ENUMS");
  for (const r of enums.rows) console.log(`  ${r.typname}: ${r.labels}`);

  const rls = await client.query(`
    select c.relname,
           c.relrowsecurity as rls_enabled,
           count(p.polname) as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    group by c.relname, c.relrowsecurity
    order by c.relname
  `);
  console.log("\n# RLS STATUS (table: rls_enabled, policies)");
  for (const r of rls.rows) {
    console.log(`  ${r.relname}: ${r.rls_enabled}, ${r.policy_count} policies`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(`ERROR: ${(e as Error).message}`);
  process.exit(2);
});
