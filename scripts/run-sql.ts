/**
 * run-sql.ts — execute a .sql file against the dev database via the pg client.
 *
 * Used to run supabase/tests/*.sql when psql is not installed. Streams
 * RAISE NOTICE output, and distinguishes a clean test failure (plpgsql ASSERT,
 * SQLSTATE P0004) from an infrastructure error.
 *
 * Run: npx tsx scripts/run-sql.ts <path-to-file.sql>
 */
import { config } from "dotenv";
import { Client } from "pg";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/run-sql.ts <file.sql>");
  process.exit(1);
}

async function main() {
  const sql = readFileSync(file, "utf8");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000,
  });
  client.on("notice", (n) => console.log(`  NOTICE: ${n.message}`));

  await client.connect();
  console.log(`Running ${file}\n`);
  try {
    await client.query(sql);
    console.log("\nRESULT: PASSED — the script completed; every assertion held.");
  } catch (e) {
    const err = e as { message?: string; code?: string };
    console.log(`\nRESULT: ${err.message ?? String(e)}`);
    if (err.code === "P0004") {
      console.log("=> Clean TEST FAILURE — an RLS assertion did not hold.");
    } else {
      console.log(
        `=> ERROR (SQLSTATE ${err.code ?? "unknown"}) — the test could not complete cleanly.`,
      );
    }
    try {
      await client.query("rollback");
    } catch {
      // connection may already be unwound
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(`Runner error: ${(e as Error).message}`);
  process.exit(2);
});
