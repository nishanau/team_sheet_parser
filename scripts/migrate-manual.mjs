import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";

const db = createClient({ url: "file:db/local.db" });

// Read and execute the generated migration SQL
const sqlFile = resolve("db/migrations/0000_redundant_silk_fever.sql");
const sql = readFileSync(sqlFile, "utf8");

// Split on drizzle breakpoints
const statements = sql
  .split("--> statement-breakpoint")
  .map(s => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  try {
    await db.execute(stmt);
    console.log("✓", stmt.slice(0, 70).replace(/\n/g, " ").trim() + "…");
  } catch (err) {
    console.error("✗", err.message, "\n  SQL:", stmt.slice(0, 80));
  }
}

// Verify
const cols = await db.execute("PRAGMA table_info(best_and_fairest)");
console.log("\nbest_and_fairest columns:", cols.rows.map(r => r.name));
const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
console.log("all tables:", tables.rows.map(r => r.name));
