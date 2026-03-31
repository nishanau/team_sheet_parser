import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

// In local dev, DATABASE_URL defaults to a local SQLite file.
// On Turso (production), set DATABASE_URL and DATABASE_AUTH_TOKEN env vars.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:db/local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
