# Centralized Logging Design

**Date:** 2026-04-03
**Scope:** Structured logging via Axiom using `@axiomhq/js`, replacing scattered `console` calls

---

## Problem

Application errors and events are logged only via `console.error`/`console.log`. On Vercel's free tier these vanish after 1 hour with no search, filtering, or alerting. There is no structured format, no log levels, and no central place to observe production behaviour.

---

## Approach

Use Axiom's official JavaScript SDK (`@axiomhq/js`) to send structured log events directly from the application to Axiom over HTTP. No Vercel log drain required — the app pushes logs itself.

In development, log to `console` only (no Axiom API calls). In production (`NODE_ENV === "production"`), send to Axiom.

---

## Logger Interface

Single file: `lib/logger.ts`

```ts
logger.debug(message: string, context?: Record<string, unknown>)
logger.info(message: string, context?: Record<string, unknown>)
logger.warn(message: string, context?: Record<string, unknown>)
logger.error(message: string, context?: Record<string, unknown>)
```

### Log Event Shape

Every event sent to Axiom has this structure:

```json
{
  "level": "error",
  "message": "db upsert failed",
  "timestamp": "2026-04-03T10:00:00.000Z",
  "teamName": "Glenorchy Senior Men",
  "error": "SQLITE_CONSTRAINT: UNIQUE constraint failed"
}
```

`timestamp` is always added by the logger. All other fields come from the `context` argument.

### Log Levels

| Level | When to use |
|---|---|
| `debug` | Cache hits, branch decisions — dev investigation only |
| `info` | Normal notable events (sync started, fixture fetched) |
| `warn` | Recoverable issues (batch item failed, fixture skipped) |
| `error` | Failures that need attention (DB error, PlayHQ unreachable) |

---

## Configuration

Two environment variables required:

| Variable | Description |
|---|---|
| `AXIOM_DATASET` | Axiom dataset name (e.g. `sfl-tools`) |
| `AXIOM_TOKEN` | Axiom API token (ingest token, not personal token) |

Both added to `.env.local` for local reference only (logger uses `console` in dev, so values are ignored locally). Both added to Vercel environment variables for production.

---

## Files Changed

| File | Change |
|---|---|
| `lib/logger.ts` | New — logger with Axiom in prod, console in dev |
| `app/api/game-players/route.ts` | Replace `console.error` with `logger.error` |
| `app/api/best-and-fairest/route.ts` | Replace `console.error` with `logger.error` |
| `app/api/coaches-vote/route.ts` | Replace `console.error` with `logger.error` |
| `app/api/coaches-vote/verify/route.ts` | Replace `console.error` with `logger.error` |
| `app/api/leagues/route.ts` | Replace `console.error` with `logger.error` |
| `app/api/cron/sync/route.ts` | Replace `console.error` with `logger.error` |
| `lib/sync.ts` | Replace `console.error` with `logger.error` |
| `.env.local` | Add `AXIOM_DATASET`, `AXIOM_TOKEN` placeholders |

---

## Out of Scope

- The `log: string[]` array in the sync pipeline — this is UI feedback for the admin sync page, not application logging. Left as-is.
- Axiom Vercel log drain integration — requires Vercel Pro
- Request-level logging middleware (access logs) — not needed at current scale
- Log rotation — handled by Axiom's 30-day retention on the free tier
