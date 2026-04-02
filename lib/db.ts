import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

// In local dev, TURSO_DATABASE_URL defaults to a local SQLite file.
// On Turso (production), set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars.
const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:db/local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
