# Error Handling Design

**Date:** 2026-04-03
**Scope:** Next.js error boundaries + fix silent catch in admin sync page

---

## Problem

Three gaps in the current error handling:

1. No `error.tsx` boundaries — an unhandled render error in any page shows a blank screen with no recovery path.
2. The admin sync page swallows network errors silently (empty `catch` blocks), leaving the user with no feedback when polling fails.
3. The game-players background upsert is fire-and-forget — this is acceptable and already logs via `console.error`; no change needed.

---

## Changes

### 1. `app/(main)/error.tsx`

A `"use client"` React error boundary for all public pages (home, teamsheet, best & fairest, coaches vote).

- Displays a simple error message and a **Try again** button that calls `reset()` (Next.js error boundary reset)
- Styled to match the existing dark glassmorphism theme using inline styles or `globals.css` variables
- Does not expose the raw error message to the user

### 2. `app/admin/error.tsx`

A `"use client"` React error boundary for all admin portal pages.

- Same structure as the public boundary
- Styled to fit inside the admin shell (no full-page layout since the shell is already rendered)
- Includes a **Try again** button

### 3. Fix sync page silent catches

File: `app/admin/sync/page.tsx`

- Identify the empty `catch` blocks used during the polling loop
- Replace with `setError(...)` calls that surface the failure in the existing error state
- No new UI needed — the sync page already has error display logic

---

## Out of Scope

- `app/global-error.tsx` — only needed for errors inside the root layout itself; not worth adding without a real use case
- Custom error classes — not needed for this scope
- Sentry or external error tracking — deferred

---

## Files Affected

| File | Change |
|---|---|
| `app/(main)/error.tsx` | New — public error boundary |
| `app/admin/error.tsx` | New — admin error boundary |
| `app/admin/sync/page.tsx` | Fix silent catch blocks |
