/**
 * dump-policies.ts — print RLS policies + helper function definitions
 * verbatim from the live dev database, for security review. Read-only.
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const TABLES = ["users", "tenants", "audit_logs", "properties"];
const FUNCS = [
  "current_user_org_id",
  "is_super_admin",
  "has_role",
  "is_org_staff",
  "is_org_manager",
  "can_write_tenants",
];

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  });
  await c.connect();

  const pols = await c.query(
    `select tablename, policyname, cmd, roles, permissive, qual, with_check
     from pg_policies
     where schemaname = 'public' and tablename = any($1)
     order by tablename, cmd, policyname`,
    [TABLES],
  );
  console.log("================ RLS POLICIES (verbatim from pg_policies) ================");
  for (const p of pols.rows) {
    console.log(`\n[${p.tablename}] policy "${p.policyname}"`);
    console.log(`  FOR      : ${p.cmd}   (permissive: ${p.permissive})`);
    console.log(`  TO roles : ${p.roles}`);
    console.log(`  USING    : ${p.qual ?? "(none)"}`);
    console.log(`  WITH CHECK: ${p.with_check ?? "(none)"}`);
  }

  const rls = await c.query(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any($1) order by c.relname`,
    [TABLES],
  );
  console.log("\n================ RLS ENABLED FLAGS ================");
  for (const r of rls.rows) {
    console.log(
      `  ${r.relname}: rowsecurity=${r.relrowsecurity}, force=${r.relforcerowsecurity}`,
    );
  }

  const fns = await c.query(
    `select p.proname, pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any($1)
     order by p.proname`,
    [FUNCS],
  );
  console.log("\n================ HELPER FUNCTIONS (verbatim) ================");
  for (const f of fns.rows) {
    console.log(`\n--- ${f.proname} ---\n${f.def}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(`ERROR: ${(e as Error).message}`);
  process.exit(2);
});
