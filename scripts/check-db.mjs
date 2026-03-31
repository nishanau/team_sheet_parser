import { createClient } from "@libsql/client";
const db = createClient({ url: "file:db/local.db" });
const res = await db.execute("PRAGMA table_info(best_and_fairest)");
console.log("best_and_fairest columns:", res.rows.map(r => r.name));
const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
console.log("all tables:", tables.rows.map(r => r.name));
