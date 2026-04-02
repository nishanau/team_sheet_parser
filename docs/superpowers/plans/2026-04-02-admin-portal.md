# Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a password-protected admin portal at `/admin` with two roles (superadmin, club_admin), leaderboards, access code management, fixture viewer, sync trigger, and duplicate alerts.

**Architecture:** NextAuth.js v5 with Credentials provider handles auth; a JWT session carries `role`, `clubId`, `leagueId`; `middleware.ts` protects all `/admin/**` routes. The cron sync is extended with a club-linking step that uses the PlayHQ search and `discoverOrganisationTeams` queries for both SFL and STJFL.

**Tech Stack:** Next.js 16 App Router, NextAuth.js v5 (`next-auth`), bcryptjs, Drizzle ORM, Turso/libsql, CSS Modules.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `auth.ts` | NextAuth v5 config — providers, JWT/session callbacks, pages |
| `middleware.ts` | Protect `/admin/**`, redirect unauthenticated, block superadmin-only routes for club_admin |
| `types/next-auth.d.ts` | Augment NextAuth Session/JWT types with role, clubId, leagueId |
| `lib/sync.ts` | `runSync` extracted from cron route — shared by cron + admin trigger |
| `app/admin/layout.tsx` | Sidebar shell — renders nav items filtered by role |
| `app/admin/layout.module.css` | Sidebar styles |
| `app/admin/page.tsx` | Redirect to `/admin/leaderboard` |
| `app/admin/login/page.tsx` | Login form using NextAuth `signIn` |
| `app/admin/login/login.module.css` | Login page styles |
| `app/admin/leaderboard/page.tsx` | Leaderboard client page — B&F tab (both roles), Coaches tab (superadmin only) |
| `app/admin/access-codes/page.tsx` | Access code table — copy, regenerate, toggle active |
| `app/admin/fixtures/page.tsx` | Read-only fixture table (superadmin only) |
| `app/admin/sync/page.tsx` | Sync trigger button + log output (superadmin only) |
| `app/admin/alerts/page.tsx` | Duplicate submission flags (scoped by role) |
| `app/api/admin/leaderboard/route.ts` | GET — aggregate B&F or coaches votes, scoped by session |
| `app/api/admin/access-codes/route.ts` | GET list, PATCH regenerate/toggle |
| `app/api/admin/fixtures/route.ts` | GET fixtures with grade/round filter |
| `app/api/admin/sync/route.ts` | POST — calls `runSync` directly, no CRON_SECRET needed |
| `app/api/admin/alerts/route.ts` | GET duplicates, DELETE submission (superadmin) |
| `scripts/seed-admin.mjs` | CLI script to create first superadmin account |

### Modified files
| File | Change |
|---|---|
| `db/schema.ts` | Add `clubs`, `adminUsers` tables; add `clubId` to `teams` |
| `app/api/cron/sync/route.ts` | Remove `runSync` body (now imported from `lib/sync.ts`) |
| `package.json` | Add `next-auth`, `bcryptjs`, `@types/bcryptjs` |
| `.env.local` | Add `NEXTAUTH_SECRET` |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `.env.local`

- [ ] **Step 1: Install packages**

```bash
cd "C:/Nishan Projects/Football_WebApp"
npm install next-auth@5 bcryptjs
npm install -D @types/bcryptjs
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Generate NEXTAUTH_SECRET and add to .env.local**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and append to `.env.local`:
```
NEXTAUTH_SECRET=<paste output here>
```

- [ ] **Step 3: Verify imports resolve**

```bash
node -e "require('bcryptjs'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "install next-auth and bcryptjs"
```

---

## Task 2: Schema changes + migration

**Files:**
- Modify: `db/schema.ts`
- Generate: `db/migrations/0002_*.sql` (via drizzle-kit)

- [ ] **Step 1: Add `clubs` and `adminUsers` tables and `clubId` on `teams` to `db/schema.ts`**

Add after the `leagues`/`teams` section:

```typescript
// ─── Clubs ────────────────────────────────────────────────────────────────────
// Parent organisation that may field teams across multiple leagues and grades.
// playhq_id is the club's routingCode from the PlayHQ search API.
export const clubs = sqliteTable("clubs", {
  id:       integer("id").primaryKey({ autoIncrement: true }),
  name:     text("name").notNull().unique(),
  playhqId: text("playhq_id").unique(),
});

export type ClubInsert = typeof clubs.$inferInsert;
export type ClubSelect = typeof clubs.$inferSelect;
```

Add after `teams` table definition (new column inside the table):
```typescript
  clubId: integer("club_id").references(() => clubs.id),
```

Add after clubs:
```typescript
// ─── Admin Users ──────────────────────────────────────────────────────────────
// role "superadmin" → club_id and league_id are null (sees everything)
// role "club_admin"  → scoped to (club_id, league_id)
export const adminUsers = sqliteTable("admin_users", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  username:     text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role:         text("role", { enum: ["superadmin", "club_admin"] }).notNull(),
  clubId:       integer("club_id").references(() => clubs.id),
  leagueId:     integer("league_id").references(() => leagues.id),
});

export type AdminUserInsert = typeof adminUsers.$inferInsert;
export type AdminUserSelect = typeof adminUsers.$inferSelect;
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
```

Expected: new file `db/migrations/0002_*.sql` created.

- [ ] **Step 3: Apply migration locally**

```bash
npm run db:migrate:local
```

Expected: migration applied, no errors.

- [ ] **Step 4: Verify tables exist**

```bash
node -e "
import('@libsql/client').then(({createClient}) => {
  const db = createClient({ url: 'file:db/local.db' });
  db.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\")
    .then(r => console.log(r.rows.map(x => x.name)));
})
"
```

Expected output includes: `admin_users`, `clubs`, and existing tables.

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts db/migrations/
git commit -m "add clubs and admin_users tables, add club_id to teams"
```

---

## Task 3: NextAuth configuration

**Files:**
- Create: `auth.ts`
- Create: `types/next-auth.d.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Create `types/next-auth.d.ts`**

```typescript
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: string;
      clubId: number | null;
      leagueId: number | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    clubId: number | null;
    leagueId: number | null;
  }
}
```

- [ ] **Step 2: Create `auth.ts` at project root**

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { adminUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const [user] = await db
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.username, credentials.username as string))
          .limit(1);
        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;
        return {
          id:       String(user.id),
          name:     user.username,
          role:     user.role,
          clubId:   user.clubId ?? null,
          leagueId: user.leagueId ?? null,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role     = (user as { role: string }).role;
        token.clubId   = (user as { clubId: number | null }).clubId;
        token.leagueId = (user as { leagueId: number | null }).leagueId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role     = token.role;
      session.user.clubId   = token.clubId;
      session.user.leagueId = token.leagueId;
      return session;
    },
  },
  pages: { signIn: "/admin/login" },
});
```

- [ ] **Step 3: Create `app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Start dev server and verify auth route responds**

```bash
npm run dev
```

Open `http://localhost:3000/api/auth/providers` — expected: JSON with `credentials` provider listed.

- [ ] **Step 5: Commit**

```bash
git add auth.ts types/next-auth.d.ts "app/api/auth/[...nextauth]/route.ts"
git commit -m "add NextAuth credentials provider"
```

---

## Task 4: Middleware — protect /admin routes

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts` at project root**

```typescript
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const SUPERADMIN_ONLY = ["/admin/fixtures", "/admin/sync"];

export default auth((req) => {
  const session = req.auth;

  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const { pathname } = req.nextUrl;
  if (
    SUPERADMIN_ONLY.some((p) => pathname.startsWith(p)) &&
    session.user.role !== "superadmin"
  ) {
    return NextResponse.redirect(new URL("/admin/leaderboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/((?!login$).*)"],
};
```

- [ ] **Step 2: Verify middleware redirects unauthenticated requests**

With dev server running, open `http://localhost:3000/admin/leaderboard` in an incognito window.
Expected: redirected to `http://localhost:3000/admin/login`.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "add admin route protection middleware"
```

---

## Task 5: Admin login page + layout

**Files:**
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/login/login.module.css`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/layout.module.css`
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/page.tsx`**

```typescript
import { redirect } from "next/navigation";
export default function AdminRoot() {
  redirect("/admin/leaderboard");
}
```

- [ ] **Step 2: Create `app/admin/login/page.tsx`**

```typescript
"use client";
import { signIn } from "next-auth/react";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const router                  = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      username: form.get("username"),
      password: form.get("password"),
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid username or password.");
    } else {
      router.push("/admin/leaderboard");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>SFL Admin</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input name="username" type="text" className={styles.input} required autoFocus />
          </label>
          <label className={styles.label}>
            Password
            <input name="password" type="password" className={styles.input} required />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/admin/login/login.module.css`**

```css
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
}
.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 40px 36px;
  width: 100%;
  max-width: 380px;
}
.title {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 28px;
  text-align: center;
}
.form { display: flex; flex-direction: column; gap: 16px; }
.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: #475569; }
.input { border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 12px; font-size: 14px; color: #1e293b; outline: none; }
.input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
.btn { background: #1e293b; color: white; border: none; border-radius: 6px; padding: 10px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 4px; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: #ef4444; font-size: 13px; margin: 0; }
```

- [ ] **Step 4: Create `app/admin/layout.tsx`**

```typescript
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import styles from "./layout.module.css";

const NAV = [
  { href: "/admin/leaderboard",   label: "Leaderboard",  superadminOnly: false },
  { href: "/admin/access-codes",  label: "Access Codes", superadminOnly: false },
  { href: "/admin/alerts",        label: "Alerts",       superadminOnly: false },
  { href: "/admin/fixtures",      label: "Fixtures",     superadminOnly: true  },
  { href: "/admin/sync",          label: "Sync",         superadminOnly: true  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/admin/login");
  const isSuperadmin = session.user.role === "superadmin";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>SFL Admin</div>
        <nav className={styles.nav}>
          {NAV.filter((n) => !n.superadminOnly || isSuperadmin).map((n) => (
            <Link key={n.href} href={n.href} className={styles.navLink}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className={styles.footer}>
          <span className={styles.username}>{session.user.name}</span>
          <span className={styles.role}>{session.user.role}</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/admin/login" }); }}>
            <button type="submit" className={styles.signOut}>Sign out</button>
          </form>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Create `app/admin/layout.module.css`**

```css
.shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #1e293b;
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}
.brand {
  color: #f1f5f9;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 0 16px 20px;
  border-bottom: 1px solid #334155;
}
.nav { display: flex; flex-direction: column; padding: 12px 0; flex: 1; }
.navLink {
  color: #94a3b8;
  font-size: 13px;
  padding: 8px 16px;
  text-decoration: none;
  transition: color 0.15s, background 0.15s;
}
.navLink:hover { color: #f1f5f9; background: #334155; }
.footer { padding: 16px; border-top: 1px solid #334155; }
.username { display: block; color: #f1f5f9; font-size: 12px; font-weight: 600; }
.role { display: block; color: #64748b; font-size: 11px; margin-bottom: 10px; }
.signOut {
  background: none;
  border: 1px solid #475569;
  color: #94a3b8;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.main { flex: 1; background: #f8fafc; padding: 28px 32px; overflow-y: auto; }
```

- [ ] **Step 6: Verify login flow**

With dev server running:
1. Open `http://localhost:3000/admin/leaderboard` — should redirect to `/admin/login`
2. Log in with wrong password — should show "Invalid username or password"
3. (Admin user seeded in Task 6 — come back here after Task 6 to verify successful login)

- [ ] **Step 7: Commit**

```bash
git add app/admin/
git commit -m "add admin login page and sidebar layout"
```

---

## Task 6: Seed admin user script

**Files:**
- Create: `scripts/seed-admin.mjs`

- [ ] **Step 1: Create `scripts/seed-admin.mjs`**

```javascript
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

const hash    = await bcrypt.hash(password, 12);
const clubId  = clubIdArg   ? Number(clubIdArg)   : null;
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
```

- [ ] **Step 2: Create first superadmin locally**

```bash
node scripts/seed-admin.mjs admin changeme superadmin
```

Expected: `Admin user "admin" (superadmin) saved to file:db/local.db`

- [ ] **Step 3: Verify login works end-to-end**

With dev server running, go to `http://localhost:3000/admin/login`, log in with `admin` / `changeme`.
Expected: redirected to `/admin/leaderboard`, sidebar visible.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-admin.mjs
git commit -m "add seed-admin script for creating admin accounts"
```

---

## Task 7: Extract runSync to lib/sync.ts

**Files:**
- Create: `lib/sync.ts`
- Modify: `app/api/cron/sync/route.ts`

- [ ] **Step 1: Create `lib/sync.ts`**

Move everything from `app/api/cron/sync/route.ts` except the route handler itself into `lib/sync.ts`. The file should export `runSync` and the constants it needs:

```typescript
import { createClient } from "@libsql/client";

// ─── Config ───────────────────────────────────────────────────────────────────
const PLAYHQ_API = "https://api.playhq.com/graphql";
const PLAYHQ_HEADERS = {
  "Content-Type": "application/json",
  Accept: "*/*",
  Origin: "https://www.playhq.com",
  Tenant: "afl",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

export const SFL_ORG_ID   = "cc453fd4";
export const STJFL_ORG_ID = "506fd6f4";

export const ALLOWED_GRADES = new Set([
  "SFL Premier League Senior Men",
  "SFL Community League Senior Men",
  "SFL Premier League Reserves Men",
  "SFL Community League Reserves Men",
  "SFL Premier League U18 Boys",
  "SFL Community League U18 Boys",
  "SFL Premier League Senior Women",
  "SFL Community League Senior Women",
]);

// ─── GraphQL Queries ──────────────────────────────────────────────────────────
// (copy all Q_* constants verbatim from the current route.ts)

// ─── Helpers ──────────────────────────────────────────────────────────────────
// (copy gql, clean, sleep, batchedMap verbatim from the current route.ts)

// ─── Main sync ────────────────────────────────────────────────────────────────
export async function runSync(log: string[]): Promise<void> {
  // (copy runSync body verbatim from the current route.ts — club sync steps added in Task 8)
}
```

- [ ] **Step 2: Update `app/api/cron/sync/route.ts` to import from lib/sync.ts**

Replace the entire file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader  = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");
    const provided    = authHeader?.replace("Bearer ", "") ?? querySecret ?? "";
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const started = Date.now();
  const log: string[] = [`Sync started at ${new Date().toISOString()}`];

  try {
    await runSync(log);
    log.push(`Sync completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return NextResponse.json({ success: true, log });
  } catch (err) {
    const msg = (err as Error).message;
    log.push(`ERROR: ${msg}`);
    console.error("[cron/sync]", err);
    return NextResponse.json({ success: false, log, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify cron sync still works**

With dev server running, hit `http://localhost:3000/api/cron/sync?secret=<your_CRON_SECRET>` (or without secret if not set).
Expected: `{"success":true,"log":[...]}` — same behaviour as before.

- [ ] **Step 4: Commit**

```bash
git add lib/sync.ts app/api/cron/sync/route.ts
git commit -m "extract runSync to lib/sync.ts"
```

---

## Task 8: Cron sync — club linking (Steps 6–7)

**Files:**
- Modify: `lib/sync.ts`

This adds two new steps at the end of `runSync`: search for clubs, then link teams to clubs.

- [ ] **Step 1: Add the two new GraphQL queries to `lib/sync.ts`**

Add after the existing query constants:

```typescript
const Q_SEARCH_CLUBS = `
query search($filter: SearchFilter!) {
  search(filter: $filter) {
    results {
      ... on Organisation {
        id
        routingCode
        name
        __typename
      }
      __typename
    }
  }
}`;

const Q_ORG_TEAMS = `
query discoverOrganisationTeams(
  $seasonCode: String!, $seasonId: ID!,
  $organisationCode: String!, $organisationId: ID!
) {
  discoverTeams(filter: { seasonID: $seasonId, organisationID: $organisationId }) {
    id
    name
    grade { id name __typename }
    __typename
  }
  discoverOrganisation(code: $organisationCode) {
    id
    name
    __typename
  }
}`;
```

- [ ] **Step 2: Add a helper to fetch clubs for one league search term**

Add after the existing helpers in `lib/sync.ts`:

```typescript
async function fetchClubsForLeague(searchQuery: string): Promise<{ routingCode: string; name: string }[]> {
  type SearchData = {
    search: { results: { routingCode?: string; name?: string; __typename: string }[] };
  };
  const data = await gql<SearchData>(Q_SEARCH_CLUBS, {
    filter: {
      meta:         { limit: 30, page: 1 },
      organisation: { query: searchQuery, types: ["CLUB"], sports: ["AFL"] },
    },
  });
  return (data.search?.results ?? [])
    .filter((r) => r.__typename === "Organisation" && r.routingCode)
    .map((r) => ({ routingCode: r.routingCode!, name: r.name ?? "" }));
}
```

- [ ] **Step 3: Add Steps 6–7 at the end of `runSync`, before the function closes**

Inside `runSync`, append after the fixtures insert step:

```typescript
  // ── Step 6: Fetch clubs for SFL and STJFL ────────────────────────────────
  log.push("Fetching clubs from PlayHQ...");

  const sflClubs   = await fetchClubsForLeague("(sfl) tas");
  const stjflClubs = await fetchClubsForLeague("(stjfl)");
  const allClubs   = [...sflClubs, ...stjflClubs];

  log.push(`  Clubs found: ${sflClubs.length} SFL, ${stjflClubs.length} STJFL`);

  // ── Step 7: For each club, get its teams for the active season and link ──
  // Collect active season IDs per org (SFL season already found in Step 1)
  const seasonIds: Record<string, string> = {};
  for (const comp of compData.discoverCompetitions ?? []) {
    for (const season of comp.seasons ?? []) {
      if (!["ACTIVE", "UPCOMING"].includes(season.status?.value ?? "")) continue;
      seasonIds[SFL_ORG_ID] = season.id;
    }
  }

  // Fetch STJFL active season
  type StjflCompData = typeof compData;
  const stjflCompData = await gql<StjflCompData>(Q_COMPETITIONS, { organisationID: STJFL_ORG_ID });
  for (const comp of stjflCompData.discoverCompetitions ?? []) {
    for (const season of comp.seasons ?? []) {
      if (!["ACTIVE", "UPCOMING"].includes(season.status?.value ?? "")) continue;
      seasonIds[STJFL_ORG_ID] = season.id;
    }
  }

  // Determine which season ID to use for SFL vs STJFL clubs
  const sflSeasonId   = seasonIds[SFL_ORG_ID];
  const stjflSeasonId = seasonIds[STJFL_ORG_ID];

  type OrgTeamsData = {
    discoverTeams: { id: string; name: string; grade: { id: string; name: string } }[];
    discoverOrganisation: { id: string; name: string };
  };

  let clubsLinked = 0;

  await batchedMap(allClubs, 5, 300, async (club) => {
    const isSjfl  = stjflClubs.some((c) => c.routingCode === club.routingCode);
    const seasonId = isSjfl ? stjflSeasonId : sflSeasonId;

    if (!seasonId) {
      log.push(`  Skipping ${club.name} — no active season found`);
      return;
    }

    const data = await gql<OrgTeamsData>(Q_ORG_TEAMS, {
      seasonCode:       seasonId,
      seasonId:         seasonId,
      organisationCode: club.routingCode,
      organisationId:   club.routingCode,
    });

    const clubName = data.discoverOrganisation?.name ?? club.name;

    // Upsert club by playhq_id
    await client.execute({
      sql: `INSERT INTO clubs (name, playhq_id) VALUES (?, ?)
            ON CONFLICT (playhq_id) DO UPDATE SET name = excluded.name`,
      args: [clubName, club.routingCode],
    });

    const clubRow = await client.execute({
      sql:  "SELECT id FROM clubs WHERE playhq_id = ?",
      args: [club.routingCode],
    });
    const clubId = clubRow.rows[0]?.id;
    if (!clubId) return;

    // Link each team to this club by (name, grade_name)
    for (const team of data.discoverTeams ?? []) {
      if (!ALLOWED_GRADES.has(team.grade?.name ?? "") && !isSjfl) continue;
      await client.execute({
        sql:  "UPDATE teams SET club_id = ? WHERE name = ? AND grade_name = ?",
        args: [clubId, team.name, team.grade?.name ?? ""],
      });
    }

    clubsLinked++;
  });

  log.push(`Clubs upserted and teams linked: ${clubsLinked}`);
```

- [ ] **Step 4: Run sync locally and verify clubs are populated**

```bash
node scripts/seed-db.mjs        # ensure leagues exist
npm run dev
# hit: http://localhost:3000/api/cron/sync (add ?secret=... if CRON_SECRET is set)
```

Then check:
```bash
node -e "
import('@libsql/client').then(({createClient}) => {
  const db = createClient({ url: 'file:db/local.db' });
  Promise.all([
    db.execute('SELECT COUNT(*) as n FROM clubs'),
    db.execute('SELECT COUNT(*) as n FROM teams WHERE club_id IS NOT NULL'),
  ]).then(([c, t]) => console.log('clubs:', c.rows[0].n, 'teams linked:', t.rows[0].n));
});
"
```

Expected: clubs > 0, teams linked > 0.

- [ ] **Step 5: Commit**

```bash
git add lib/sync.ts
git commit -m "extend cron sync with club and team linking (steps 6-7)"
```

---

## Task 9: Leaderboard API

**Files:**
- Create: `app/api/admin/leaderboard/route.ts`

- [ ] **Step 1: Create `app/api/admin/leaderboard/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes, teams } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

// Vote weight per position (index 0 = player1 = 5 votes)
const VOTE_WEIGHTS = [5, 4, 3, 2, 1];

type VoteEntry = { playerName: string; playerNumber: string | null; team: string; votes: number; round: string };
type LeaderboardRow = { rank: number; playerName: string; playerNumber: string | null; team: string; roundVotes: number; totalVotes: number };

function extractVotes(
  rows: { player1Name: string | null; player1Number: string | null; player2Name: string | null; player2Number: string | null; player3Name: string | null; player3Number: string | null; player4Name: string | null; player4Number: string | null; player5Name: string | null; player5Number: string | null; homeTeam?: string | null; coachTeam?: string | null; round: string }[],
  teamField: "homeTeam" | "coachTeam"
): VoteEntry[] {
  const result: VoteEntry[] = [];
  const playerFields = [
    ["player1Name", "player1Number"],
    ["player2Name", "player2Number"],
    ["player3Name", "player3Number"],
    ["player4Name", "player4Number"],
    ["player5Name", "player5Number"],
  ] as const;

  for (const row of rows) {
    const team = (teamField === "homeTeam" ? row.homeTeam : row.coachTeam) ?? "";
    for (let i = 0; i < 5; i++) {
      const [nameKey, numKey] = playerFields[i];
      const name = row[nameKey];
      if (!name) continue;
      result.push({ playerName: name, playerNumber: row[numKey] ?? null, team, votes: VOTE_WEIGHTS[i], round: row.round });
    }
  }
  return result;
}

function buildLeaderboard(entries: VoteEntry[], selectedRound: string | "all"): LeaderboardRow[] {
  const map = new Map<string, LeaderboardRow & { rank: number }>();
  for (const e of entries) {
    const key      = `${e.playerName}::${e.team}`;
    const existing = map.get(key) ?? { rank: 0, playerName: e.playerName, playerNumber: e.playerNumber, team: e.team, roundVotes: 0, totalVotes: 0 };
    existing.totalVotes += e.votes;
    if (selectedRound !== "all" && e.round === selectedRound) existing.roundVotes += e.votes;
    map.set(key, existing);
  }
  return [...map.values()]
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const type        = searchParams.get("type") ?? "bf";          // "bf" | "coaches"
  const competition = searchParams.get("competition") ?? "SFL";
  const grade       = searchParams.get("grade") ?? "";
  const round       = searchParams.get("round") ?? "all";

  // Coaches votes: superadmin only
  if (type === "coaches" && session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Club admin: get their team names
  let scopedTeamNames: string[] | null = null;
  if (session.user.role === "club_admin" && session.user.clubId && session.user.leagueId) {
    const clubTeams = await db
      .select({ name: teams.name })
      .from(teams)
      .where(and(eq(teams.clubId, session.user.clubId), eq(teams.leagueId, session.user.leagueId)));
    scopedTeamNames = clubTeams.map((t) => t.name);
    if (scopedTeamNames.length === 0) return NextResponse.json([]);
  }

  if (type === "coaches") {
    const filters = [eq(coachesVotes.grade, grade)];
    const rows = await db.select().from(coachesVotes).where(and(...filters));
    const entries = extractVotes(rows as Parameters<typeof extractVotes>[0], "coachTeam");
    return NextResponse.json(buildLeaderboard(entries, round));
  }

  // Best & Fairest
  const bfFilters = [
    eq(bestAndFairest.competition, competition),
    ...(grade ? [eq(bestAndFairest.grade, grade)] : []),
    ...(scopedTeamNames ? [inArray(bestAndFairest.homeTeam as any, scopedTeamNames)] : []),
  ];
  const rows = await db.select().from(bestAndFairest).where(and(...bfFilters));
  const entries = extractVotes(rows as Parameters<typeof extractVotes>[0], "homeTeam");
  return NextResponse.json(buildLeaderboard(entries, round));
}
```

- [ ] **Step 2: Test the endpoint manually**

With dev server running, log in as admin, then open:
```
http://localhost:3000/api/admin/leaderboard?type=bf&competition=SFL&grade=SFL%20Community%20League%20Senior%20Men&round=all
```
Expected: JSON array (may be empty if no votes submitted yet).

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/leaderboard/route.ts
git commit -m "add admin leaderboard API with role scoping"
```

---

## Task 10: Leaderboard page

**Files:**
- Create: `app/admin/leaderboard/page.tsx`
- Create: `app/admin/leaderboard/leaderboard.module.css`

- [ ] **Step 1: Create `app/admin/leaderboard/page.tsx`**

```typescript
"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import Select from "@/app/components/Select";
import { ROUND_OPTIONS, GRADE_MAP, AGE_GROUPS } from "@/lib/constants";
import styles from "./leaderboard.module.css";

type Row = { rank: number; playerName: string; playerNumber: string | null; team: string; roundVotes: number; totalVotes: number };

const COMPETITIONS = ["SFL", "STJFL"];

function allGradesFor(competition: string) {
  return Object.values(GRADE_MAP)
    .flat()
    .filter((g) => g.startsWith(competition));
}

function exportCSV(rows: Row[], filename: string) {
  const headers = "Rank,Player,Number,Team,Round Votes,Total Votes";
  const lines   = rows.map((r) =>
    `${r.rank},"${r.playerName}","${r.playerNumber ?? ""}","${r.team}",${r.roundVotes},${r.totalVotes}`
  );
  const blob = new Blob([[headers, ...lines].join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const isSuperadmin      = session?.user?.role === "superadmin";

  const [tab,         setTab]         = useState<"bf" | "coaches">("bf");
  const [competition, setCompetition] = useState("SFL");
  const [grade,       setGrade]       = useState("");
  const [round,       setRound]       = useState("all");
  const [rows,        setRows]        = useState<Row[]>([]);
  const [loading,     setLoading]     = useState(false);

  const grades = allGradesFor(competition);

  useEffect(() => {
    if (grades.length > 0 && !grades.includes(grade)) setGrade(grades[0]);
  }, [competition]);

  useEffect(() => {
    const params = new URLSearchParams({ type: tab, competition, round });
    if (grade) params.set("grade", grade);
    setLoading(true);
    fetch(`/api/admin/leaderboard?${params}`)
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, [tab, competition, grade, round]);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Leaderboard</h1>
        <button
          className={styles.exportBtn}
          onClick={() => exportCSV(rows, `leaderboard-${grade}-${round}.csv`)}
          disabled={rows.length === 0}
        >
          Export CSV
        </button>
      </div>

      {isSuperadmin && (
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "bf" ? styles.tabActive : ""}`} onClick={() => setTab("bf")}>
            Best &amp; Fairest
          </button>
          <button className={`${styles.tab} ${tab === "coaches" ? styles.tabActive : ""}`} onClick={() => setTab("coaches")}>
            Coaches Votes
          </button>
        </div>
      )}

      <div className={styles.filters}>
        {tab === "bf" && (
          <Select value={competition} onChange={setCompetition} options={COMPETITIONS} />
        )}
        <Select value={grade} onChange={setGrade} options={grades} />
        <Select
          value={round}
          onChange={setRound}
          options={["all", ...ROUND_OPTIONS]}
        />
      </div>

      {loading ? (
        <p className={styles.hint}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className={styles.hint}>No votes found for the selected filters.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>#</th>
              <th className={styles.th}>Player</th>
              <th className={styles.th}>No.</th>
              <th className={styles.th}>Team</th>
              <th className={styles.th}>Round</th>
              <th className={styles.th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.playerName}-${r.team}`} className={styles.tr}>
                <td className={styles.td}>{r.rank}</td>
                <td className={styles.td}>{r.playerName}</td>
                <td className={styles.td}>{r.playerNumber ?? "—"}</td>
                <td className={styles.td}>{r.team}</td>
                <td className={styles.td}>{r.roundVotes}</td>
                <td className={styles.td}><strong>{r.totalVotes}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/admin/leaderboard/leaderboard.module.css`**

```css
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.title  { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.exportBtn { background: #1e293b; color: white; border: none; border-radius: 6px; padding: 7px 14px; font-size: 12px; cursor: pointer; }
.exportBtn:disabled { opacity: 0.4; cursor: not-allowed; }
.tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
.tab { background: none; border: none; padding: 8px 16px; font-size: 13px; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tabActive { color: #1e293b; font-weight: 600; border-bottom-color: #1e293b; }
.filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.hint    { color: #64748b; font-size: 14px; }
.table   { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.th      { background: #f1f5f9; padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
.tr:hover { background: #f8fafc; }
.td      { padding: 10px 14px; font-size: 13px; color: #1e293b; border-bottom: 1px solid #f1f5f9; }
```

- [ ] **Step 3: Add SessionProvider to admin layout**

Wrap children in `app/admin/layout.tsx` with `SessionProvider` (required for `useSession` in client components):

At the top of `app/admin/layout.tsx`, add import:
```typescript
import { SessionProvider } from "next-auth/react";
```

Wrap `<main>` content:
```typescript
<SessionProvider>
  <main className={styles.main}>{children}</main>
</SessionProvider>
```

- [ ] **Step 4: Verify leaderboard page renders**

Open `http://localhost:3000/admin/leaderboard` — filters render, table shows "No votes found" if empty.

- [ ] **Step 5: Commit**

```bash
git add app/admin/leaderboard/
git commit -m "add admin leaderboard page with tab, grade, round filters and CSV export"
```

---

## Task 11: Access codes API + page

**Files:**
- Create: `app/api/admin/access-codes/route.ts`
- Create: `app/admin/access-codes/page.tsx`
- Create: `app/admin/access-codes/access-codes.module.css`

- [ ] **Step 1: Create `app/api/admin/access-codes/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { teamAccessCodes, teams, clubs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf   = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[buf[i] % chars.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id:        teamAccessCodes.id,
      teamName:  teamAccessCodes.teamName,
      gradeName: teamAccessCodes.gradeName,
      code:      teamAccessCodes.code,
      active:    teamAccessCodes.active,
      clubId:    teams.clubId,
    })
    .from(teamAccessCodes)
    .leftJoin(teams, and(eq(teams.name, teamAccessCodes.teamName), eq(teams.gradeName, teamAccessCodes.gradeName)))
    .orderBy(teamAccessCodes.gradeName, teamAccessCodes.teamName);

  if (session.user.role === "club_admin") {
    return NextResponse.json(rows.filter((r) => r.clubId === session.user.clubId));
  }
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json() as { id: number; action: "regenerate" | "toggle" };
  const { id, action } = body;

  // Scope check for club_admin
  if (session.user.role === "club_admin") {
    const [row] = await db
      .select({ clubId: teams.clubId })
      .from(teamAccessCodes)
      .leftJoin(teams, and(eq(teams.name, teamAccessCodes.teamName), eq(teams.gradeName, teamAccessCodes.gradeName)))
      .where(eq(teamAccessCodes.id, id))
      .limit(1);
    if (row?.clubId !== session.user.clubId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (action === "regenerate") {
    const newCode = genCode();
    await db.update(teamAccessCodes).set({ code: newCode }).where(eq(teamAccessCodes.id, id));
    return NextResponse.json({ code: newCode });
  }

  if (action === "toggle") {
    const [current] = await db.select({ active: teamAccessCodes.active }).from(teamAccessCodes).where(eq(teamAccessCodes.id, id)).limit(1);
    await db.update(teamAccessCodes).set({ active: !current.active }).where(eq(teamAccessCodes.id, id));
    return NextResponse.json({ active: !current.active });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
```

- [ ] **Step 2: Create `app/admin/access-codes/page.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import styles from "./access-codes.module.css";

type CodeRow = { id: number; teamName: string; gradeName: string; code: string; active: boolean };

export default function AccessCodesPage() {
  const [rows, setRows]     = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/access-codes")
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  async function regenerate(id: number) {
    const res  = await fetch("/api/admin/access-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "regenerate" }) });
    const data = await res.json() as { code: string };
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, code: data.code } : r));
  }

  async function toggle(id: number) {
    const res  = await fetch("/api/admin/access-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "toggle" }) });
    const data = await res.json() as { active: boolean };
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, active: data.active } : r));
  }

  function copy(id: number, code: string) {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 className={styles.title}>Access Codes</h1>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Team</th>
            <th className={styles.th}>Grade</th>
            <th className={styles.th}>Code</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`${styles.tr} ${!r.active ? styles.inactive : ""}`}>
              <td className={styles.td}>{r.teamName}</td>
              <td className={styles.td}>{r.gradeName}</td>
              <td className={styles.td}><code className={styles.code}>{r.code}</code></td>
              <td className={styles.td}><span className={r.active ? styles.badgeActive : styles.badgeInactive}>{r.active ? "Active" : "Inactive"}</span></td>
              <td className={styles.td}>
                <div className={styles.actions}>
                  <button className={styles.btn} onClick={() => copy(r.id, r.code)}>{copied === r.id ? "Copied!" : "Copy"}</button>
                  <button className={styles.btn} onClick={() => regenerate(r.id)}>Regenerate</button>
                  <button className={`${styles.btn} ${r.active ? styles.btnDanger : ""}`} onClick={() => toggle(r.id)}>{r.active ? "Deactivate" : "Activate"}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/admin/access-codes/access-codes.module.css`**

```css
.title    { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 20px; }
.table    { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.th       { background: #f1f5f9; padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
.tr       { border-bottom: 1px solid #f1f5f9; }
.tr:hover { background: #f8fafc; }
.inactive { opacity: 0.5; }
.td       { padding: 10px 14px; font-size: 13px; color: #1e293b; }
.code     { font-family: monospace; font-size: 13px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
.badgeActive   { background: #dcfce7; color: #15803d; font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
.badgeInactive { background: #f1f5f9; color: #64748b; font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
.actions  { display: flex; gap: 6px; }
.btn      { border: 1px solid #e2e8f0; background: white; color: #475569; font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
.btn:hover { background: #f1f5f9; }
.btnDanger { border-color: #fecaca; color: #dc2626; }
```

- [ ] **Step 4: Verify page renders with codes (requires `add-access-codes.mjs` to have been run locally)**

```bash
node scripts/add-access-codes.mjs
```

Then open `http://localhost:3000/admin/access-codes` — table of teams and codes visible.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/access-codes/ app/admin/access-codes/
git commit -m "add access codes admin page with copy, regenerate, toggle"
```

---

## Task 12: Alerts API + page

**Files:**
- Create: `app/api/admin/alerts/route.ts`
- Create: `app/admin/alerts/page.tsx`
- Create: `app/admin/alerts/alerts.module.css`

- [ ] **Step 1: Create `app/api/admin/alerts/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes, teams } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find B&F duplicates: same (competition, grade, round, home_team) > 1 submission
  const bfDupes = await db
    .select({
      type:      sql<string>`'bf'`.as("type"),
      grade:     bestAndFairest.grade,
      round:     bestAndFairest.round,
      team:      bestAndFairest.homeTeam,
      count:     sql<number>`COUNT(*)`.as("count"),
      firstDate: sql<string>`MIN(created_at)`.as("firstDate"),
      lastDate:  sql<string>`MAX(created_at)`.as("lastDate"),
    })
    .from(bestAndFairest)
    .groupBy(bestAndFairest.competition, bestAndFairest.grade, bestAndFairest.round, bestAndFairest.homeTeam)
    .having(sql`COUNT(*) > 1`);

  // Find Coaches Vote duplicates: same (grade, round, coach_team) > 1 submission
  const cvDupes = session.user.role === "superadmin"
    ? await db
        .select({
          type:      sql<string>`'coaches'`.as("type"),
          grade:     coachesVotes.grade,
          round:     coachesVotes.round,
          team:      coachesVotes.coachTeam,
          count:     sql<number>`COUNT(*)`.as("count"),
          firstDate: sql<string>`MIN(created_at)`.as("firstDate"),
          lastDate:  sql<string>`MAX(created_at)`.as("lastDate"),
        })
        .from(coachesVotes)
        .groupBy(coachesVotes.grade, coachesVotes.round, coachesVotes.coachTeam)
        .having(sql`COUNT(*) > 1`)
    : [];

  let alerts = [...bfDupes, ...cvDupes];

  // Scope club_admin to their teams
  if (session.user.role === "club_admin" && session.user.clubId) {
    const clubTeams = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.clubId, session.user.clubId));
    const nameSet = new Set(clubTeams.map((t) => t.name));
    alerts = alerts.filter((a) => nameSet.has(a.team ?? ""));
  }

  return NextResponse.json(alerts);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, type } = await req.json() as { id: number; type: "bf" | "coaches" };

  if (type === "bf") {
    await db.delete(bestAndFairest).where(eq(bestAndFairest.id, id));
  } else {
    await db.delete(coachesVotes).where(eq(coachesVotes.id, id));
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create `app/admin/alerts/page.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import styles from "./alerts.module.css";

type Alert = { type: string; grade: string | null; round: string; team: string | null; count: number; firstDate: string; lastDate: string };

export default function AlertsPage() {
  const { data: session }   = useSession();
  const isSuperadmin        = session?.user?.role === "superadmin";
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/alerts")
      .then((r) => r.json())
      .then(setAlerts)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 className={styles.title}>Duplicate Submission Alerts</h1>
      {alerts.length === 0 ? (
        <p className={styles.empty}>No duplicate submissions found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Grade</th>
              <th className={styles.th}>Round</th>
              <th className={styles.th}>Team</th>
              <th className={styles.th}>Count</th>
              <th className={styles.th}>First</th>
              <th className={styles.th}>Last</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={i} className={styles.tr}>
                <td className={styles.td}><span className={a.type === "bf" ? styles.badgeBf : styles.badgeCv}>{a.type === "bf" ? "B&F" : "Coaches"}</span></td>
                <td className={styles.td}>{a.grade}</td>
                <td className={styles.td}>{a.round}</td>
                <td className={styles.td}>{a.team}</td>
                <td className={styles.td}><strong>{a.count}</strong></td>
                <td className={styles.td}>{a.firstDate?.slice(0, 10)}</td>
                <td className={styles.td}>{a.lastDate?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/admin/alerts/alerts.module.css`**

```css
.title  { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 20px; }
.empty  { color: #64748b; font-size: 14px; }
.table  { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.th     { background: #f1f5f9; padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
.tr     { border-bottom: 1px solid #f1f5f9; }
.tr:hover { background: #f8fafc; }
.td     { padding: 10px 14px; font-size: 13px; color: #1e293b; }
.badgeBf  { background: #dbeafe; color: #1d4ed8; font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
.badgeCv  { background: #fef9c3; color: #a16207; font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/alerts/ app/admin/alerts/
git commit -m "add duplicate submission alerts page"
```

---

## Task 13: Fixtures page + Sync page

**Files:**
- Create: `app/api/admin/fixtures/route.ts`
- Create: `app/admin/fixtures/page.tsx`
- Create: `app/api/admin/sync/route.ts`
- Create: `app/admin/sync/page.tsx`
- Create: `app/admin/shared.module.css`

- [ ] **Step 1: Create `app/api/admin/fixtures/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { fixtures } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = req.nextUrl;
  const grade = searchParams.get("grade");
  const round = searchParams.get("round");

  const filters = [
    ...(grade ? [eq(fixtures.gradeName, grade)] : []),
    ...(round ? [eq(fixtures.roundName, round)] : []),
  ];

  const rows = await db
    .select()
    .from(fixtures)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(fixtures.gradeName, fixtures.roundName, fixtures.matchDate)
    .limit(500);

  return NextResponse.json(rows);
}
```

- [ ] **Step 2: Create `app/api/admin/sync/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runSync } from "@/lib/sync";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const started = Date.now();
  const log: string[] = [`Admin sync started at ${new Date().toISOString()}`];

  try {
    await runSync(log);
    log.push(`Completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return NextResponse.json({ success: true, log });
  } catch (err) {
    log.push(`ERROR: ${(err as Error).message}`);
    return NextResponse.json({ success: false, log }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `app/admin/shared.module.css`** (shared table styles reused by fixtures + any future pages)

```css
.pageTitle { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 20px; }
.filters   { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.table     { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.th        { background: #f1f5f9; padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
.tr:hover  { background: #f8fafc; }
.td        { padding: 10px 14px; font-size: 13px; color: #1e293b; border-bottom: 1px solid #f1f5f9; }
.hint      { color: #64748b; font-size: 14px; }
```

- [ ] **Step 4: Create `app/admin/fixtures/page.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import Select from "@/app/components/Select";
import { ALLOWED_GRADES, ROUND_OPTIONS } from "@/lib/constants";
import styles from "../shared.module.css";

type Fixture = { id: string; gradeName: string; roundName: string; matchDate: string; homeTeamName: string; awayTeamName: string; venueName: string | null };

export default function FixturesPage() {
  const [grade,    setGrade]    = useState("");
  const [round,    setRound]    = useState("");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (grade) params.set("grade", grade);
    if (round) params.set("round", round);
    setLoading(true);
    fetch(`/api/admin/fixtures?${params}`)
      .then((r) => r.json())
      .then(setFixtures)
      .finally(() => setLoading(false));
  }, [grade, round]);

  return (
    <div>
      <h1 className={styles.pageTitle}>Fixtures</h1>
      <div className={styles.filters}>
        <Select value={grade} onChange={setGrade} options={["All grades", ...Array.from(ALLOWED_GRADES)]} />
        <Select value={round} onChange={setRound} options={["All rounds", ...ROUND_OPTIONS]} />
      </div>
      {loading ? <p className={styles.hint}>Loading…</p> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Grade</th>
              <th className={styles.th}>Round</th>
              <th className={styles.th}>Date</th>
              <th className={styles.th}>Home</th>
              <th className={styles.th}>Away</th>
              <th className={styles.th}>Venue</th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((f) => (
              <tr key={f.id} className={styles.tr}>
                <td className={styles.td}>{f.gradeName}</td>
                <td className={styles.td}>{f.roundName}</td>
                <td className={styles.td}>{f.matchDate}</td>
                <td className={styles.td}>{f.homeTeamName}</td>
                <td className={styles.td}>{f.awayTeamName}</td>
                <td className={styles.td}>{f.venueName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `app/admin/sync/page.tsx`**

```typescript
"use client";
import { useState } from "react";
import styles from "./sync.module.css";

export default function SyncPage() {
  const [log,     setLog]     = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done,    setDone]    = useState(false);

  async function handleSync() {
    setRunning(true);
    setDone(false);
    setLog(["Starting sync…"]);
    const res  = await fetch("/api/admin/sync", { method: "POST" });
    const data = await res.json() as { log: string[] };
    setLog(data.log);
    setRunning(false);
    setDone(true);
  }

  return (
    <div>
      <h1 className={styles.title}>PlayHQ Sync</h1>
      <p className={styles.hint}>Fetches fixtures, teams, and clubs from PlayHQ and updates the database.</p>
      <button className={styles.btn} onClick={handleSync} disabled={running}>
        {running ? "Syncing…" : "Run PlayHQ Sync"}
      </button>
      {log.length > 0 && (
        <pre className={styles.log}>{log.join("\n")}</pre>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `app/admin/sync/sync.module.css`**

```css
.title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 8px; }
.hint  { color: #64748b; font-size: 14px; margin: 0 0 20px; }
.btn   { background: #1e293b; color: white; border: none; border-radius: 6px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.log   { margin-top: 24px; background: #1e293b; color: #94a3b8; font-size: 12px; padding: 16px; border-radius: 8px; white-space: pre-wrap; line-height: 1.6; max-height: 500px; overflow-y: auto; }
```

- [ ] **Step 7: Note — export ALLOWED_GRADES from constants.ts**

`app/admin/fixtures/page.tsx` imports `ALLOWED_GRADES` from `lib/constants.ts`. Add this export to `lib/constants.ts`:

```typescript
export const ALLOWED_GRADES = new Set([
  "SFL Premier League Senior Men",
  "SFL Community League Senior Men",
  "SFL Premier League Reserves Men",
  "SFL Community League Reserves Men",
  "SFL Premier League U18 Boys",
  "SFL Community League U18 Boys",
  "SFL Premier League Senior Women",
  "SFL Community League Senior Women",
]);
```

Then in `lib/sync.ts`, replace the inline `ALLOWED_GRADES` definition with:
```typescript
import { ALLOWED_GRADES } from "@/lib/constants";
```

- [ ] **Step 8: Verify all four pages load**

Open each in browser (logged in as admin):
- `http://localhost:3000/admin/fixtures`
- `http://localhost:3000/admin/sync` → click "Run PlayHQ Sync" and verify log output appears

- [ ] **Step 9: Commit**

```bash
git add app/api/admin/fixtures/ app/api/admin/sync/ app/admin/fixtures/ app/admin/sync/ app/admin/shared.module.css lib/constants.ts lib/sync.ts
git commit -m "add fixtures page, sync trigger page, and admin API routes"
```

---

## Task 14: Migrate Turso + seed superadmin + deploy

- [ ] **Step 1: Apply migration to Turso**

```bash
npm run db:migrate
```

Expected: both migrations (0002 included) applied to Turso.

- [ ] **Step 2: Verify migration on Turso**

```bash
npm run db:check
```

Expected: all migrations shown as applied.

- [ ] **Step 3: Add NEXTAUTH_SECRET to Vercel environment variables**

In the Vercel dashboard → Project Settings → Environment Variables, add:
```
NEXTAUTH_SECRET = <same value as in .env.local>
NEXTAUTH_URL    = https://<your-app>.vercel.app
```

- [ ] **Step 4: Seed superadmin on Turso**

```bash
node --env-file=.env.local scripts/seed-admin.mjs admin <secure-password> superadmin
```

- [ ] **Step 5: Commit and push**

```bash
git add .
git commit -m "admin portal complete"
git push origin master
```

- [ ] **Step 6: Smoke test on Vercel**

1. Open `https://<your-app>.vercel.app/admin` — should redirect to login
2. Log in with the superadmin credentials from Step 4
3. Verify sidebar shows all 5 items
4. Run sync from `/admin/sync`
5. Verify `/admin/leaderboard` shows grades, `/admin/access-codes` shows codes

---

## Self-Review Notes

**Spec coverage check:**
- ✅ NextAuth credentials + two roles
- ✅ clubs + admin_users schema + teams.club_id
- ✅ Middleware protects /admin/**, superadmin-only routes redirect club_admin
- ✅ Cron sync extended with SFL + STJFL club search and team linking
- ✅ Leaderboard: B&F (both roles), Coaches (superadmin), competition/grade/round filter, CSV export
- ✅ Access codes: list, copy, regenerate, toggle active
- ✅ Fixtures: read-only, grade/round filter, superadmin only
- ✅ Sync trigger: superadmin only, calls runSync directly
- ✅ Alerts: B&F + coaches duplicates, scoped by role
- ✅ NEXTAUTH_SECRET env var addressed
- ✅ ALLOWED_GRADES moved to constants.ts to avoid duplication

**Known dependency:** `add-access-codes.mjs` must be run before the access codes page has data. This is existing behaviour — the script seeds the `team_access_codes` table.
