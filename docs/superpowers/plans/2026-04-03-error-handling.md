# Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Next.js error boundaries to public and admin segments, and improve sync page polling resilience.

**Architecture:** Two `error.tsx` files act as React error boundaries at the route segment level — Next.js renders them automatically when a component in that segment throws. The sync page polling catches are intentionally silent for single network blips, but will surface an error after 5 consecutive failures.

**Tech Stack:** Next.js App Router (`error.tsx` convention), React, CSS variables from `globals.css`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/(main)/error.tsx` | Create | Error boundary for all public pages |
| `app/admin/error.tsx` | Create | Error boundary for all admin pages |
| `app/admin/sync/page.tsx` | Modify lines 12–48 | Track consecutive poll failures, show error after 5 |

---

### Task 1: Public error boundary

**Files:**
- Create: `app/(main)/error.tsx`

- [ ] **Step 1: Create the error boundary component**

`app/(main)/error.tsx`:
```tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      gap: "16px",
      textAlign: "center",
      padding: "32px",
    }}>
      <h2 style={{ color: "var(--text)", fontSize: "20px", fontWeight: 700, margin: 0 }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0, maxWidth: 360 }}>
        An unexpected error occurred. You can try again or refresh the page.
      </p>
      <button
        onClick={reset}
        style={{
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          padding: "8px 20px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it is picked up by Next.js**

Run `npm run build` and confirm no TypeScript errors. The build output should list `app/(main)/error` as a route segment file.

- [ ] **Step 3: Commit**

```bash
git add app/\(main\)/error.tsx
git commit -m "feat: add error boundary for public pages"
```

---

### Task 2: Admin error boundary

**Files:**
- Create: `app/admin/error.tsx`

- [ ] **Step 1: Create the error boundary component**

The admin shell is already rendered around this — no full-page layout needed, just an in-content message.

`app/admin/error.tsx`:
```tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      padding: "32px",
      maxWidth: 480,
    }}>
      <h2 style={{ color: "var(--text)", fontSize: "18px", fontWeight: 700, margin: 0 }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>
        An unexpected error occurred on this page.
      </p>
      <button
        onClick={reset}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          color: "var(--accent)",
          border: "1px solid var(--accent)",
          borderRadius: "8px",
          padding: "7px 18px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors. `app/admin/error` appears in the build output.

- [ ] **Step 3: Commit**

```bash
git add app/admin/error.tsx
git commit -m "feat: add error boundary for admin pages"
```

---

### Task 3: Fix sync page polling resilience

**Files:**
- Modify: `app/admin/sync/page.tsx`

The two polling `catch` blocks are intentionally silent for single blips — that is correct. The fix adds a consecutive failure counter so that if the server is genuinely unreachable for 5 polls in a row, an error is shown instead of silently polling forever.

- [ ] **Step 1: Add failure counter ref and update the poll function**

Replace lines 12–48 in `app/admin/sync/page.tsx`:

```tsx
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailures          = useRef(0);
```

Replace the `poll()` function inside the initial `useEffect` (lines 16–29):

```tsx
    async function poll() {
      try {
        const res  = await fetch("/api/admin/sync");
        const data = await res.json() as SyncState;
        pollFailures.current = 0;
        setState(data);
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        if (data.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        pollFailures.current += 1;
        if (pollFailures.current >= 5) {
          setState((prev) => ({ ...prev, status: "error", log: [...prev.log, "Connection lost. Please refresh."] }));
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      }
    }
```

Replace the interval callback inside `startPolling()` (lines 37–48):

```tsx
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch("/api/admin/sync");
        const data = await res.json() as SyncState;
        pollFailures.current = 0;
        setState(data);
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        if (data.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        pollFailures.current += 1;
        if (pollFailures.current >= 5) {
          setState((prev) => ({ ...prev, status: "error", log: [...prev.log, "Connection lost. Please refresh."] }));
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      }
    }, 1000);
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/sync/page.tsx
git commit -m "fix: surface connection errors in sync page after 5 consecutive poll failures"
```
