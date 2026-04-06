# Comprehensive Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured `category` field to all existing logger calls and add new `info`/`warn`/`debug` logs across auth, public API routes, sync pipeline, and admin routes so every meaningful event is observable in Axiom.

**Architecture:** Single Axiom dataset. Every log event gains a `category` field (`"api"`, `"auth"`, `"business"`, `"sync"`) so events can be filtered in Axiom without separate datasets. The `logger` at `lib/logger.ts` already handles Axiom ingest — no changes to the logger itself.

**Tech Stack:** Next.js 14 App Router, TypeScript, `lib/logger.ts` (already exists), Axiom (via existing `AXIOM_DATASET` + `AXIOM_TOKEN` env vars)

---

## File Map

| File | Change |
|---|---|
| `auth.ts` | Add login success/failure logs in `authorize` callback |
| `app/api/leagues/route.ts` | Add category to error, add request info log |
| `app/api/fixtures/route.ts` | Add category to error, add request info log |
| `app/api/game-players/route.ts` | Add category to errors, add cache-hit debug + PlayHQ fetch info |
| `app/api/best-and-fairest/route.ts` | Add category to errors, add vote-submitted business log |
| `app/api/coaches-vote/route.ts` | Add category to errors, add vote-submitted business log |
| `app/api/coaches-vote/fixtures/route.ts` | Add category to error |
| `app/api/coaches-vote/verify/route.ts` | Add category to error, add rate-limit warn + invalid-code warn + success info |
| `app/api/cron/sync/route.ts` | Add category to error, add triggered info |
| `app/api/admin/sync/route.ts` | Add triggered + error logs |
| `app/api/admin/leaderboard/route.ts` | Add request info log + error log |
| `app/api/admin/access-codes/route.ts` | Add regenerate/toggle business logs + error logs |
| `app/api/admin/users/route.ts` | Add created/updated/deleted business logs + error logs |
| `lib/sync.ts` | Add category to existing warn, add step-completion info logs + timing |

---

### Task 1: Add `category` to all existing logger calls

Adds `category` to the 12 existing `logger.error`/`logger.warn` calls so every log event has the field.

**Files:**
- Modify: `app/api/leagues/route.ts`
- Modify: `app/api/fixtures/route.ts`
- Modify: `app/api/game-players/route.ts`
- Modify: `app/api/best-and-fairest/route.ts`
- Modify: `app/api/coaches-vote/route.ts`
- Modify: `app/api/coaches-vote/fixtures/route.ts`
- Modify: `app/api/coaches-vote/verify/route.ts`
- Modify: `app/api/cron/sync/route.ts`
- Modify: `lib/sync.ts`

- [ ] **Step 1: Update `app/api/leagues/route.ts`**

Find (line ~42):
```ts
logger.error("[leagues] GET failed", { error: String(err) });
```
Replace with:
```ts
logger.error("[leagues] GET failed", { category: "api", error: String(err) });
```

- [ ] **Step 2: Update `app/api/fixtures/route.ts`**

Find (line ~41):
```ts
logger.error("[fixtures] GET failed", { error: String(err), grade, homeTeam, round });
```
Replace with:
```ts
logger.error("[fixtures] GET failed", { category: "api", error: String(err), grade, homeTeam, round });
```

- [ ] **Step 3: Update `app/api/game-players/route.ts`**

Find (line ~117):
```ts
logger.error("[game-players] PlayHQ fetch error", { error: String(err) });
```
Replace with:
```ts
logger.error("[game-players] PlayHQ fetch error", { category: "api", error: String(err) });
```

Find (line ~208):
```ts
logger.error("[game-players] upsert error", { error: String(err), gameId, teamName });
```
Replace with:
```ts
logger.error("[game-players] upsert error", { category: "api", error: String(err), gameId, teamName });
```

- [ ] **Step 4: Update `app/api/best-and-fairest/route.ts`**

Find POST error (line ~183):
```ts
logger.error("[best-and-fairest] POST failed", { error: String(err) });
```
Replace with:
```ts
logger.error("[best-and-fairest] POST failed", { category: "api", error: String(err) });
```

Find GET error (line ~199):
```ts
logger.error("[best-and-fairest] GET failed", { error: String(err) });
```
Replace with:
```ts
logger.error("[best-and-fairest] GET failed", { category: "api", error: String(err) });
```

- [ ] **Step 5: Update `app/api/coaches-vote/route.ts`**

Find POST error (line ~180):
```ts
logger.error("[coaches-vote] POST failed", { error: String(e) });
```
Replace with:
```ts
logger.error("[coaches-vote] POST failed", { category: "api", error: String(e) });
```

Find GET error (line ~194):
```ts
logger.error("[coaches-vote] GET failed", { error: String(e) });
```
Replace with:
```ts
logger.error("[coaches-vote] GET failed", { category: "api", error: String(e) });
```

- [ ] **Step 6: Update `app/api/coaches-vote/fixtures/route.ts`**

Find (line ~78):
```ts
logger.error("[coaches-vote/fixtures] GET failed", { error: String(e), grade, teamName });
```
Replace with:
```ts
logger.error("[coaches-vote/fixtures] GET failed", { category: "api", error: String(e), grade, teamName });
```

- [ ] **Step 7: Update `app/api/coaches-vote/verify/route.ts`**

Find (line ~82):
```ts
logger.error("[coaches-vote/verify] POST failed", { error: String(e) });
```
Replace with:
```ts
logger.error("[coaches-vote/verify] POST failed", { category: "api", error: String(e) });
```

- [ ] **Step 8: Update `app/api/cron/sync/route.ts`**

Find (line ~27):
```ts
logger.error("[cron/sync] failed", { error: String(err) });
```
Replace with:
```ts
logger.error("[cron/sync] failed", { category: "sync", error: String(err) });
```

- [ ] **Step 9: Update `lib/sync.ts`**

Find (line ~140):
```ts
logger.warn("[sync] batch item failed", { reason: String(r.reason) });
```
Replace with:
```ts
logger.warn("[sync] batch item failed", { category: "sync", reason: String(r.reason) });
```

- [ ] **Step 10: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git add app/api/leagues/route.ts app/api/fixtures/route.ts app/api/game-players/route.ts app/api/best-and-fairest/route.ts app/api/coaches-vote/route.ts app/api/coaches-vote/fixtures/route.ts app/api/coaches-vote/verify/route.ts app/api/cron/sync/route.ts lib/sync.ts
git commit -m "feat: add category field to all existing logger calls"
```

---

### Task 2: Auth event logging

**Files:**
- Modify: `auth.ts`

- [ ] **Step 1: Add logger import and auth event logs**

`auth.ts` currently imports from `next-auth`, `next-auth/providers/credentials`, `@/lib/db`, `@/db/schema`, `drizzle-orm`, and `bcryptjs`. Add the logger import in the internal group:

```ts
import { logger } from "@/lib/logger";
```

Then modify the `authorize` callback. Replace lines 17–37:

```ts
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const username = credentials.username as string;
        const [user] = await db
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.username, username))
          .limit(1);
        if (!user) {
          logger.warn("[auth] login failed", { category: "auth", username, reason: "user not found" });
          return null;
        }
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) {
          logger.warn("[auth] login failed", { category: "auth", username, reason: "invalid password" });
          return null;
        }
        logger.info("[auth] login success", { category: "auth", username, role: user.role });
        return {
          id:       String(user.id),
          name:     user.username,
          role:     user.role,
          clubId:   user.clubId ?? null,
          leagueId: user.leagueId ?? null,
        };
      },
```

The only change to the logic is extracting `credentials.username as string` into a `username` variable so it can be passed to the logger. Everything else is identical.

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add auth.ts
git commit -m "feat: add auth event logging for login success and failure"
```

---

### Task 3: Public API info logs

Adds request-level `info` logs to leagues, fixtures, game-players, and coaches-vote/verify routes.

**Files:**
- Modify: `app/api/leagues/route.ts`
- Modify: `app/api/fixtures/route.ts`
- Modify: `app/api/game-players/route.ts`
- Modify: `app/api/coaches-vote/verify/route.ts`

- [ ] **Step 1: Update `app/api/leagues/route.ts`**

Read the file. Find the `GET` handler function body. Add a single info log at the start of the try block, before the DB query:

```ts
  try {
    logger.info("[leagues] GET", { category: "api" });
    // ... existing DB query ...
```

- [ ] **Step 2: Update `app/api/fixtures/route.ts`**

Read the file. Find the try block inside `GET`. Add an info log after the `grade`/`homeTeam`/`round` variables are parsed (they are already validated as non-empty before the try block, so they are safe to log here):

```ts
  try {
    logger.info("[fixtures] GET", { category: "api", grade, homeTeam, round: round ?? null });
    // ... existing DB query ...
```

- [ ] **Step 3: Update `app/api/game-players/route.ts`**

Read the file. Find where `gameId` and `teamName` are parsed from query params, and where the `alreadyFetched` cache check happens. Add:

1. A `debug` log on cache hit (just before the early `return NextResponse.json({ players: cached, source: "cache" })`):
```ts
logger.debug("[game-players] cache hit", { category: "api", gameId, teamName });
return NextResponse.json({ players: cached, source: "cache" });
```

2. An `info` log just before the PlayHQ fetch (before the `const res = await fetch(PLAYHQ_API, ...)` call):
```ts
logger.info("[game-players] PlayHQ fetch", { category: "api", gameId, teamName });
```

- [ ] **Step 4: Update `app/api/coaches-vote/verify/route.ts`**

Read the file. This file has three observable events to log:

1. Rate limit hit — add just before the `return NextResponse.json({ error: "Too many attempts..." }, { status: 429 })` line:
```ts
    logger.warn("[coaches-vote/verify] rate limit hit", { category: "auth", ip });
    return NextResponse.json(
      { error: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
```

2. Invalid code — add just before `return NextResponse.json({ error: "Invalid access code." }, { status: 401 })`:
```ts
      logger.warn("[coaches-vote/verify] invalid code", { category: "auth" });
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
```

3. Success — add just before `return NextResponse.json({ teamName: row.teamName, gradeName: row.gradeName })`:
```ts
      logger.info("[coaches-vote/verify] code verified", { category: "auth", teamName: row.teamName, gradeName: row.gradeName });
      return NextResponse.json({ teamName: row.teamName, gradeName: row.gradeName });
```

- [ ] **Step 5: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/leagues/route.ts app/api/fixtures/route.ts app/api/game-players/route.ts app/api/coaches-vote/verify/route.ts
git commit -m "feat: add request info logs to public API routes"
```

---

### Task 4: Business event logs for vote routes

Adds `info` logs when a vote is successfully submitted in best-and-fairest and coaches-vote.

**Files:**
- Modify: `app/api/best-and-fairest/route.ts`
- Modify: `app/api/coaches-vote/route.ts`

- [ ] **Step 1: Update `app/api/best-and-fairest/route.ts`**

Read the file. Find the POST handler. After the `db.insert(...)` call that saves the vote record succeeds (and before the `return NextResponse.json({ ok: true })` response), add:

```ts
    logger.info("[best-and-fairest] vote submitted", {
      category: "business",
      grade,
      round,
      homeTeam,
      opposition,
      initials,
    });
```

The variables `grade`, `round`, `homeTeam`, `opposition`, and `initials` are all already validated and in scope at this point. Do not log `submitterName` — names are PII.

- [ ] **Step 2: Update `app/api/coaches-vote/route.ts`**

Read the file. Find the POST handler. After the `db.insert(...)` call that saves the vote record succeeds (before the success response), add:

```ts
    logger.info("[coaches-vote] vote submitted", {
      category: "business",
      grade,
      round,
      homeTeam,
      awayTeam,
      coachTeam,
    });
```

Do not log `submitterName` or `initials` in a way that identifies a real person. `coachTeam` is a team name, not a person's name — safe to log.

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/best-and-fairest/route.ts app/api/coaches-vote/route.ts
git commit -m "feat: add business event logs for vote submissions"
```

---

### Task 5: Sync pipeline logs

Adds step-completion info logs and end-to-end timing to `lib/sync.ts`, a triggered log to `app/api/admin/sync/route.ts`, and a triggered log to `app/api/cron/sync/route.ts`.

**Files:**
- Modify: `lib/sync.ts`
- Modify: `app/api/admin/sync/route.ts`
- Modify: `app/api/cron/sync/route.ts`

- [ ] **Step 1: Update `lib/sync.ts` — add timing and step-completion logs**

Read the file. The `runSync` function starts at line 163. Make these additions:

**At the very start of `runSync` (after the `client` is created, before the leagueRows query — around line 177):**
```ts
  const syncStartedAt = Date.now();
  logger.info("[sync] started", { category: "sync" });
```

**After the `gradeEntries` loop completes (after line 234, the `log.push("Grades to sync: ...")` line):**
```ts
  logger.info("[sync] step1 complete", {
    category: "sync",
    gradeCount: gradeEntries.length,
    sflGrades: gradeEntries.filter((g) => g.orgId === SFL_ORG_ID).length,
    stjflGrades: gradeEntries.filter((g) => g.orgId === STJFL_ORG_ID).length,
  });
```

**After the `batchedMap` for Step 2 completes (after line 256, the closing `});` of the step 2 batchedMap):**
```ts
  logger.info("[sync] step2 complete", { category: "sync", teamCount: uniqueTeamIds.size });
```

**After the `batchedMap` for Step 3 completes and `sflGames`/`stjflGames` are defined (after line 312, the `log.push("Total unique games...")` line):**
```ts
  logger.info("[sync] step3 complete", {
    category: "sync",
    gameCount: allGames.size,
    sflGames: sflGames.length,
    stjflGames: stjflGames.length,
  });
```

**After the teams batch insert in Step 4 (after line 337, the `log.push("Teams inserted: ...")` line):**
```ts
  logger.info("[sync] step4 complete", { category: "sync", teamsInserted: teamInserts.length });
```

**After the fixtures batch insert in Step 5 (after line 361, the `log.push("Fixtures inserted: ...")` line):**
```ts
  logger.info("[sync] step5 complete", { category: "sync", fixturesInserted: fixtureInserts.length });
```

**After the clubs are fetched in Step 6 (after line 372, the `log.push("Clubs found: ...")` line):**
```ts
  logger.info("[sync] step6 complete", { category: "sync", sflClubs: sflClubs.length, stjflClubs: stjflClubs.length });
```

**After the clubs batchedMap in Step 7 completes (after line 435, the `log.push("Clubs upserted...")` line, just before the closing `}` of `runSync`):**
```ts
  logger.info("[sync] step7 complete", { category: "sync", clubsLinked });
  logger.info("[sync] completed", { category: "sync", durationMs: Date.now() - syncStartedAt });
```

- [ ] **Step 2: Update `app/api/admin/sync/route.ts`**

Add import after existing imports:
```ts
import { logger } from "@/lib/logger";
```

In the `POST` handler, add a log just after the `startSync()` call (line 33) and before the fire-and-forget IIFE:
```ts
  startSync();
  logger.info("[admin/sync] triggered", { category: "business", triggeredBy: session.user.name ?? "unknown" });
```

Also add an error log inside the fire-and-forget catch block (currently only calls `appendLog` and `finishSync`):
```ts
    } catch (err) {
      appendLog(`ERROR: ${(err as Error).message}`);
      logger.error("[admin/sync] failed", { category: "sync", error: String(err) });
      finishSync(false);
    }
```

- [ ] **Step 3: Update `app/api/cron/sync/route.ts`**

Read the file. Add a log at the start of the `GET` handler (after the secret check passes, before `runSync` is called):
```ts
  logger.info("[cron/sync] triggered", { category: "sync" });
```

Add a success log after `runSync` returns:
```ts
  logger.info("[cron/sync] completed", { category: "sync" });
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add lib/sync.ts app/api/admin/sync/route.ts app/api/cron/sync/route.ts
git commit -m "feat: add sync pipeline step-completion and timing logs"
```

---

### Task 6: Admin portal API logs

Adds request info and business event logs to `admin/leaderboard`, `admin/access-codes`, and `admin/users`. Also adds error handling (try/catch + logger.error) to routes that currently have none.

**Files:**
- Modify: `app/api/admin/leaderboard/route.ts`
- Modify: `app/api/admin/access-codes/route.ts`
- Modify: `app/api/admin/users/route.ts`

- [ ] **Step 1: Update `app/api/admin/leaderboard/route.ts`**

Read the file first to find the GET handler structure.

Add import:
```ts
import { logger } from "@/lib/logger";
```

Wrap the entire handler body in a try/catch and add a request info log. The handler receives `type`, `competition`, `grade`, `round` from query params and `session.user.role`. Add this log after params are parsed and session is confirmed:

```ts
  logger.info("[admin/leaderboard] GET", {
    category: "api",
    type,
    competition,
    grade,
    round: round ?? null,
    role: session.user.role,
  });
```

Wrap the DB/computation logic in try/catch:
```ts
  try {
    // ... existing query and leaderboard computation ...
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[admin/leaderboard] GET failed", { category: "api", error: String(err), type, grade });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
```

- [ ] **Step 2: Update `app/api/admin/access-codes/route.ts`**

Read the file first.

Add import:
```ts
import { logger } from "@/lib/logger";
```

In the `PATCH` handler, after the `regenerate` branch successfully updates the code, add:
```ts
  if (action === "regenerate") {
    const newCode = genCode();
    await db.update(teamAccessCodes).set({ code: newCode }).where(eq(teamAccessCodes.id, id));
    logger.info("[access-codes] regenerated", { category: "business", id, role: session.user.role });
    return NextResponse.json({ code: newCode });
  }
```

After the `toggle` branch successfully updates, add:
```ts
  if (action === "toggle") {
    const [current] = await db.select({ active: teamAccessCodes.active }).from(teamAccessCodes).where(eq(teamAccessCodes.id, id)).limit(1);
    await db.update(teamAccessCodes).set({ active: !current.active }).where(eq(teamAccessCodes.id, id));
    logger.info("[access-codes] toggled", { category: "business", id, active: !current.active, role: session.user.role });
    return NextResponse.json({ active: !current.active });
  }
```

Wrap the PATCH handler body in try/catch:
```ts
export async function PATCH(req: NextRequest) {
  // ... existing session + scope checks ...
  try {
    // ... existing action logic with logger.info calls added above ...
  } catch (err) {
    logger.error("[access-codes] PATCH failed", { category: "api", error: String(err), id, action });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
```

Note: `id` and `action` are destructured before the try block, so they are in scope in the catch.

- [ ] **Step 3: Update `app/api/admin/users/route.ts`**

Read the file first.

Add import:
```ts
import { logger } from "@/lib/logger";
```

**POST handler** — after `db.insert(...).returning(...)` succeeds, add before the return:
```ts
  logger.info("[admin/users] created", { category: "business", username: username.trim(), clubId });
  return NextResponse.json(created, { status: 201 });
```

Wrap POST body in try/catch:
```ts
export async function POST(req: NextRequest) {
  if (!(await requireSuperadmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    // ... existing validation + insert ...
  } catch (err) {
    logger.error("[admin/users] POST failed", { category: "api", error: String(err) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
```

**PATCH handler** — after `db.update(...).returning(...)` succeeds, add before the return:
```ts
  logger.info("[admin/users] updated", { category: "business", id });
  return NextResponse.json(updated);
```

Wrap PATCH body in try/catch:
```ts
export async function PATCH(req: NextRequest) {
  if (!(await requireSuperadmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    // ... existing validation + update ...
  } catch (err) {
    logger.error("[admin/users] PATCH failed", { category: "api", error: String(err) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
```

**DELETE handler** — after `db.delete(...)` succeeds, add before the return:
```ts
  logger.info("[admin/users] deleted", { category: "business", id, username: user.username });
  return NextResponse.json({ ok: true });
```

Wrap DELETE body in try/catch:
```ts
export async function DELETE(req: NextRequest) {
  if (!(await requireSuperadmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    // ... existing validation + delete ...
  } catch (err) {
    logger.error("[admin/users] DELETE failed", { category: "api", error: String(err) });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/leaderboard/route.ts app/api/admin/access-codes/route.ts app/api/admin/users/route.ts
git commit -m "feat: add info and error logs to admin API routes"
```
