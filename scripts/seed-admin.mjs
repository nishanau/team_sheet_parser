// Creates or resets an admin user in the target database.
// Usage:
//   Local:  node scripts/seed-admin.mjs <username> <password> <role> [club_id] [league_id]
//   Turso:  node --env-file=.env.local scripts/seed-admin.mjs <username> <password> <role>
//
// role: superadmin | club_admin
// Examples:
//   node scripts/seed-admin.mjs admin secret123 superadmin
//   node --env-file=.env.local scripts/seed-admin.mjs brighton_sfl pass456 club_admin 3 1
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const [,, username, password, role, clubIdArg, leagueIdArg] = process.argv;

if (!username || !password || !["superadmin", "club_admin"].includes(role)) {
  console.error("Usage: seed-admin.mjs <username> <password> <superadmin|club_admin> [club_id] [league_id]");
  process.exit(1);
}

const url       = process.env.TURSO_DATABASE_URL ?? "file:db/local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db        = createClient(authToken ? { url, authToken } : { url });

const hash     = await bcrypt.hash(password, 12);
const clubId   = clubIdArg   ? Number(clubIdArg)   : null;
const leagueId = leagueIdArg ? Number(leagueIdArg) : null;

await db.execute({
  sql: `INSERT INTO admin_users (username, password_hash, role, club_id, league_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = excluded.password_hash,
          role          = excluded.role,
          club_id       = excluded.club_id,
          league_id     = excluded.league_id`,
  args: [username, hash, role, clubId, leagueId],
});

console.log(`Admin user "${username}" (${role}) saved to ${url}`);
await db.close();
