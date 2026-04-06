# Centralized Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured logger (`lib/logger.ts`) that writes to the console in dev and pushes events to Axiom in production, replacing all `console.error`/`console.log` calls across API routes and sync code.

**Architecture:** Single `lib/logger.ts` exposes `logger.debug/info/warn/error`. In production it fire-and-forgets a JSON POST to the Axiom ingest API; in dev it writes JSON to the console. No SDK — direct `fetch` keeps the bundle small and avoids import issues in Edge/Node runtimes.

**Tech Stack:** Next.js App Router (Node.js runtime), TypeScript, Axiom HTTP Ingest API (`https://api.axiom.co/v1/datasets/:dataset/ingest`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/logger.ts` | Create | Logger with Axiom in prod, console in dev |
| `app/api/game-players/route.ts` | Modify lines ~116, ~207 | Replace `console.error` |
| `lib/sync.ts` | Modify line ~138 | Replace `console.error` |
| `app/api/leagues/route.ts` | Modify line ~41 | Replace `console.error` |
| `app/api/fixtures/route.ts` | Modify line ~40 | Replace `console.error` |
| `app/api/best-and-fairest/route.ts` | Modify lines ~182, ~198 | Replace `console.error` |
| `app/api/coaches-vote/route.ts` | Modify lines ~179, ~193 | Replace `console.error` |
| `app/api/coaches-vote/fixtures/route.ts` | Modify line ~77 | Replace `console.error` |
| `app/api/coaches-vote/verify/route.ts` | Modify line ~81 | Replace `console.error` |
| `app/api/cron/sync/route.ts` | Modify line ~26 | Replace `console.error` |
| `.env.local` | Modify | Add `AXIOM_DATASET` and `AXIOM_TOKEN` placeholders |

---

### Task 1: Create `lib/logger.ts`

**Files:**
- Create: `lib/logger.ts`

- [ ] **Step 1: Create the logger**

`lib/logger.ts`:
```ts
type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

function send(level: Level, message: string, context: Context = {}): void {
  const event = { level, message, timestamp: new Date().toISOString(), ...context };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(event));
  if (
    process.env.NODE_ENV === "production" &&
    process.env.AXIOM_TOKEN &&
    process.env.AXIOM_DATASET
  ) {
    fetch(
      `https://api.axiom.co/v1/datasets/${process.env.AXIOM_DATASET}/ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([event]),
      }
    ).catch(() => {});
  }
}

export const logger = {
  debug: (msg: string, ctx?: Context) => send("debug", msg, ctx),
  info:  (msg: string, ctx?: Context) => send("info",  msg, ctx),
  warn:  (msg: string, ctx?: Context) => send("warn",  msg, ctx),
  error: (msg: string, ctx?: Context) => send("error", msg, ctx),
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add lib/logger.ts
git commit -m "feat: add structured logger with Axiom prod ingest"
```

---

### Task 2: Replace console calls in `app/api/game-players/route.ts` and `lib/sync.ts`

**Files:**
- Modify: `app/api/game-players/route.ts`
- Modify: `lib/sync.ts`

- [ ] **Step 1: Update `app/api/game-players/route.ts`**

Add import at the top of the file (after existing imports):
```ts
import { logger } from "@/lib/logger";
```

Find the two `console.error` calls:

1. PlayHQ fetch error (~line 116) — replace:
```ts
console.error("[game-players] PlayHQ fetch error", err);
```
with:
```ts
logger.error("[game-players] PlayHQ fetch error", { error: String(err) });
```

2. Upsert error (~line 207) — replace:
```ts
console.error("[game-players] upsert error", err);
```
with:
```ts
logger.error("[game-players] upsert error", { error: String(err) });
```

- [ ] **Step 2: Update `lib/sync.ts`**

Add import at the top of the file (after existing imports):
```ts
import { logger } from "./logger";
```

Find the batch item failure log (~line 138) — replace:
```ts
console.error("[cron] batch item failed:", r.reason);
```
with:
```ts
logger.warn("[sync] batch item failed", { reason: String(r.reason) });
```

(This is `warn` not `error` because a single batch item failure is recoverable — the sync continues.)

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/game-players/route.ts lib/sync.ts
git commit -m "feat: replace console calls with logger in game-players and sync"
```

---

### Task 3: Replace console calls in remaining API routes

**Files:**
- Modify: `app/api/leagues/route.ts`
- Modify: `app/api/fixtures/route.ts`
- Modify: `app/api/best-and-fairest/route.ts`
- Modify: `app/api/coaches-vote/route.ts`
- Modify: `app/api/coaches-vote/fixtures/route.ts`
- Modify: `app/api/coaches-vote/verify/route.ts`
- Modify: `app/api/cron/sync/route.ts`

For each file: add `import { logger } from "@/lib/logger";` then replace each `console.error` as below.

- [ ] **Step 1: Update `app/api/leagues/route.ts`**

Add import:
```ts
import { logger } from "@/lib/logger";
```

Replace (~line 41):
```ts
console.error("[leagues GET]", err);
```
with:
```ts
logger.error("[leagues] GET failed", { error: String(err) });
```

- [ ] **Step 2: Update `app/api/fixtures/route.ts`**

Add import:
```ts
import { logger } from "@/lib/logger";
```

Replace (~line 40):
```ts
console.error("[fixtures GET]", err);
```
with:
```ts
logger.error("[fixtures] GET failed", { error: String(err) });
```

- [ ] **Step 3: Update `app/api/best-and-fairest/route.ts`**

Add import:
```ts
import { logger } from "@/lib/logger";
```

Replace POST handler error (~line 182):
```ts
console.error("[best-and-fairest POST]", err);
```
with:
```ts
logger.error("[best-and-fairest] POST failed", { error: String(err) });
```

Replace GET handler error (~line 198):
```ts
console.error("[best-and-fairest GET]", err);
```
with:
```ts
logger.error("[best-and-fairest] GET failed", { error: String(err) });
```

- [ ] **Step 4: Update `app/api/coaches-vote/route.ts`**

Add import:
```ts
import { logger } from "@/lib/logger";
```

Replace POST handler error (~line 179):
```ts
console.error("[coaches-vote POST]", err);
```
with:
```ts
logger.error("[coaches-vote] POST failed", { error: String(err) });
```

Replace GET handler error (~line 193):
```ts
console.error("[coaches-vote GET]", err);
```
with:
```ts
logger.error("[coaches-vote] GET failed", { error: String(err) });
```

- [ ] **Step 5: Update `app/api/coaches-vote/fixtures/route.ts`**

Add import:
```ts
import { logger } from "@/lib/logger";
```

Replace (~line 77):
```ts
console.error("[coaches-vote/fixtures GET]", err);
```
with:
```ts
logger.error("[coaches-vote/fixtures] GET failed", { error: String(err) });
```

- [ ] **Step 6: Update `app/api/coaches-vote/verify/route.ts`**

Add import:
```ts
import { logger } from "@/lib/logger";
```

Replace (~line 81):
```ts
console.error("[coaches-vote/verify POST]", err);
```
with:
```ts
logger.error("[coaches-vote/verify] POST failed", { error: String(err) });
```

- [ ] **Step 7: Update `app/api/cron/sync/route.ts`**

Add import:
```ts
import { logger } from "@/lib/logger";
```

Replace (~line 26):
```ts
console.error("[cron/sync]", err);
```
with:
```ts
logger.error("[cron/sync] failed", { error: String(err) });
```

- [ ] **Step 8: Verify build**

Run: `npm run build`

Expected: no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add app/api/leagues/route.ts app/api/fixtures/route.ts app/api/best-and-fairest/route.ts app/api/coaches-vote/route.ts app/api/coaches-vote/fixtures/route.ts app/api/coaches-vote/verify/route.ts app/api/cron/sync/route.ts
git commit -m "feat: replace console calls with logger in all API routes"
```

---

### Task 4: Add env var placeholders to `.env.local`

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Append placeholders**

Open `.env.local` and append these two lines at the end (after existing content):

```
# Axiom (logging) — only used in production; ignored when NODE_ENV=development
AXIOM_DATASET=
AXIOM_TOKEN=
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .env.local
git commit -m "chore: add AXIOM_DATASET and AXIOM_TOKEN env var placeholders"
```
