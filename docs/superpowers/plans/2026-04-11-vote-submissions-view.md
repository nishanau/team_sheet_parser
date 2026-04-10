# Vote Submissions View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a superadmin-only `/admin/votes` page that shows every raw BnF and CoachesVotes submission as round-grouped cards, plus a totals footer on the existing leaderboard.

**Architecture:** New `GET /api/admin/votes` endpoint returns raw rows from both tables for a given grade. A new Next.js page component renders them as two stacked card sections grouped by round. The existing leaderboard API gets a `totals` field added to its response; the leaderboard page renders it as a footer.

**Tech Stack:** Next.js App Router, Drizzle ORM (SQLite), NextAuth, CSS Modules

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/admin/votes/route.ts` | Create | API: return raw BnF + CoachesVotes rows for a grade |
| `app/admin/votes/page.tsx` | Create | Page: filter UI + two card sections |
| `app/admin/votes/votes.module.css` | Create | Styles for cards, sections, round headings |
| `app/admin/layout.tsx` | Modify | Add "Votes" link to NAV array |
| `app/api/admin/leaderboard/route.ts` | Modify | Add `totals: { bf, coaches }` to all response shapes |
| `app/admin/leaderboard/page.tsx` | Modify | Render totals footer below table |
| `app/admin/leaderboard/leaderboard.module.css` | Modify | Add `.totals` style |

---

## Task 1: Create `/api/admin/votes` route

**Files:**
- Create: `app/api/admin/votes/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bestAndFairest, coachesVotes } from "@/db/schema";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grade = req.nextUrl.searchParams.get("grade") ?? "";
  if (!grade) return NextResponse.json({ bf: [], coaches: [] });

  logger.info("[admin/votes] GET", { category: "api", grade });

  try {
    const [bf, coaches] = await Promise.all([
      db.select().from(bestAndFairest).where(eq(bestAndFairest.grade, grade)),
      db.select().from(coachesVotes).where(eq(coachesVotes.grade, grade)),
    ]);
    return NextResponse.json({ bf, coaches });
  } catch (err) {
    logger.error("[admin/votes] GET failed", { category: "api", error: String(err), grade });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: no TypeScript errors for the new file.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/votes/route.ts
git commit -m "feat: add /api/admin/votes endpoint for raw submission audit"
```

---

## Task 2: Add "Votes" to admin sidebar

**Files:**
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Add the nav entry**

In `app/admin/layout.tsx`, find the `NAV` array and add the Votes entry as the second item (after Leaderboard):

```typescript
const NAV = [
  { href: "/admin/leaderboard",  label: "Leaderboard",  superadminOnly: false },
  { href: "/admin/votes",        label: "Votes",        superadminOnly: true  },
  { href: "/admin/access-codes", label: "Access Codes", superadminOnly: true  },
  { href: "/admin/fixtures",     label: "Fixtures",     superadminOnly: true  },
  { href: "/admin/users",        label: "Users",        superadminOnly: true  },
  { href: "/admin/sync",         label: "Sync",         superadminOnly: true  },
];
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat: add Votes link to admin sidebar"
```

---

## Task 3: Create votes page CSS

**Files:**
- Create: `app/admin/votes/votes.module.css`

- [ ] **Step 1: Create the file**

```css
.header  { display: flex; align-items: center; margin-bottom: 20px; }
.title   { font-size: 20px; font-weight: 700; color: var(--text); margin: 0; }
.filters { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
.filters > * { flex: 1; min-width: 160px; max-width: 260px; }
.gradeSelect   { flex: 2 !important; min-width: 200px !important; max-width: 420px !important; }
.gradeTrigger  { white-space: normal !important; overflow: visible !important; text-overflow: unset !important; height: auto !important; }
.hint    { color: var(--muted); font-size: 14px; }

/* Sections */
.section      { margin-bottom: 40px; }
.sectionTitle { font-size: 16px; font-weight: 700; color: var(--text); margin: 0 0 16px; }

/* Round grouping */
.roundGroup   { margin-bottom: 28px; }
.roundHeading {
  font-size: 12px; font-weight: 700; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.06em;
  margin: 0 0 12px; padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

/* Cards */
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 10px;
}
.cardHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}
.matchup { font-weight: 600; font-size: 14px; color: var(--text); }
.meta    { font-size: 12px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }
.badge   {
  display: inline-block;
  background: var(--panel2); border: 1px solid var(--border);
  border-radius: 6px; padding: 2px 8px;
  font-size: 12px; color: var(--muted);
  margin-bottom: 10px;
}

/* Player list */
.players { list-style: none; padding: 0; margin: 0 0 12px; }
.playerRow {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 0; font-size: 13px; color: var(--text);
  border-bottom: 1px solid var(--border);
}
.playerRow:last-child { border-bottom: none; }
.voteWeight {
  background: var(--accent); color: white;
  border-radius: 4px; padding: 1px 7px;
  font-size: 11px; font-weight: 700;
  min-width: 52px; text-align: center;
  flex-shrink: 0;
}
.playerNum { color: var(--muted); font-size: 12px; min-width: 36px; flex-shrink: 0; }

/* Footer */
.cardFooter {
  display: flex; justify-content: space-between; gap: 8px;
  font-size: 12px; color: var(--muted);
  border-top: 1px solid var(--border); padding-top: 10px;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/votes/votes.module.css
git commit -m "feat: add votes page CSS module"
```

---

## Task 4: Create votes page component

**Files:**
- Create: `app/admin/votes/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

import Select from "@/app/components/Select";
import { GRADE_MAP, ROUND_OPTIONS } from "@/lib/constants";
import type { BestAndFairestSelect, CoachesVoteSelect } from "@/db/schema";
import styles from "./votes.module.css";

const VOTE_WEIGHTS = [5, 4, 3, 2, 1] as const;
const COMPETITIONS = ["SFL", "STJFL"];

type ApiResponse = { bf: BestAndFairestSelect[]; coaches: CoachesVoteSelect[] };

function allGradesFor(competition: string) {
  return Object.entries(GRADE_MAP)
    .filter(([key]) => key.startsWith(competition))
    .flatMap(([, grades]) => grades)
    .filter((g) => g.length > 0);
}

function groupByRound<T extends { round: string }>(items: T[]): { round: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!map.has(item.round)) map.set(item.round, []);
    map.get(item.round)!.push(item);
  }
  return ROUND_OPTIONS.filter((r) => map.has(r)).map((r) => ({ round: r, items: map.get(r)! }));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function getPlayers(sub: BestAndFairestSelect | CoachesVoteSelect) {
  return [
    { num: sub.player1Number, name: sub.player1Name },
    { num: sub.player2Number, name: sub.player2Name },
    { num: sub.player3Number, name: sub.player3Name },
    { num: sub.player4Number, name: sub.player4Name },
    { num: sub.player5Number, name: sub.player5Name },
  ].filter((p): p is { num: string | null; name: string } => p.name !== null && p.name !== "");
}

function PlayerList({ sub }: { sub: BestAndFairestSelect | CoachesVoteSelect }) {
  const players = getPlayers(sub);
  return (
    <ul className={styles.players}>
      {players.map((p, i) => (
        <li key={i} className={styles.playerRow}>
          <span className={styles.voteWeight}>{VOTE_WEIGHTS[i]} votes</span>
          <span className={styles.playerNum}>#{p.num ?? "—"}</span>
          <span>{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

function BfCard({ sub }: { sub: BestAndFairestSelect }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.matchup}>{sub.submittingTeam} vs {sub.opposition}</span>
        <span className={styles.meta}>{formatDate(sub.matchDate)}</span>
      </div>
      <span className={styles.badge}>{sub.competition} · {sub.ageGroup}</span>
      <PlayerList sub={sub} />
      <div className={styles.cardFooter}>
        <span>Submitted by: {sub.submitterName}</span>
        <span>{new Date(sub.createdAt).toLocaleString("en-AU")}</span>
      </div>
    </div>
  );
}

function CoachCard({ sub }: { sub: CoachesVoteSelect }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.matchup}>{sub.homeTeam} vs {sub.awayTeam}</span>
        <span className={styles.meta}>{formatDate(sub.matchDate)}</span>
      </div>
      <span className={styles.badge}>Coach: {sub.coachTeam}</span>
      <PlayerList sub={sub} />
      <div className={styles.cardFooter}>
        <span>Submitted by: {sub.submitterName}</span>
        <span>{new Date(sub.createdAt).toLocaleString("en-AU")}</span>
      </div>
    </div>
  );
}

export default function VotesPage() {
  useSession(); // ensures session context is available via SessionProvider in layout

  const [competition, setCompetition] = useState("SFL");
  const [grade, setGrade] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const grades = allGradesFor(competition);

  function handleCompetitionChange(val: string) {
    setCompetition(val);
    setGrade("");
    setData(null);
  }

  useEffect(() => {
    if (!grade) { setData(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res: ApiResponse = await fetch(`/api/admin/votes?grade=${encodeURIComponent(grade)}`).then((r) => r.json());
        if (!cancelled) setData(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [grade]);

  const bfGroups  = data ? groupByRound(data.bf)      : [];
  const cvGroups  = data ? groupByRound(data.coaches)  : [];

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Vote Submissions</h1>
      </div>

      <div className={styles.filters}>
        <Select value={competition} onChange={handleCompetitionChange} options={COMPETITIONS} />
        <Select
          value={grade}
          onChange={setGrade}
          options={grades}
          placeholder="Select Grade"
          className={styles.gradeSelect}
          triggerClassName={styles.gradeTrigger}
        />
      </div>

      {loading ? (
        <p className={styles.hint}>Loading…</p>
      ) : !grade ? (
        <p className={styles.hint}>Select a grade to view submissions.</p>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Best &amp; Fairest Submissions</h2>
            {bfGroups.length === 0 ? (
              <p className={styles.hint}>No submissions for this grade.</p>
            ) : bfGroups.map(({ round, items }) => (
              <div key={round} className={styles.roundGroup}>
                <h3 className={styles.roundHeading}>{round}</h3>
                {items.map((sub) => <BfCard key={sub.id} sub={sub} />)}
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Coaches Votes Submissions</h2>
            {cvGroups.length === 0 ? (
              <p className={styles.hint}>No submissions for this grade.</p>
            ) : cvGroups.map(({ round, items }) => (
              <div key={round} className={styles.roundGroup}>
                <h3 className={styles.roundHeading}>{round}</h3>
                {items.map((sub) => <CoachCard key={sub.id} sub={sub} />)}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/votes/page.tsx
git commit -m "feat: add /admin/votes page with BnF and CoachesVotes submission cards"
```

---

## Task 5: Add `totals` to leaderboard API response

**Files:**
- Modify: `app/api/admin/leaderboard/route.ts`

- [ ] **Step 1: Add `count` to the drizzle import**

Change the import line at the top of `app/api/admin/leaderboard/route.ts`:

```typescript
import { and, eq, inArray, count } from "drizzle-orm";
```

- [ ] **Step 2: Add totals query and attach to both response branches**

Inside the `try` block in the `GET` handler, just before the `if (round === "all")` branch, add the totals queries:

```typescript
// Count raw submissions for the selected grade (both types, regardless of active tab)
const [[bfRow], [cvRow]] = await Promise.all([
  db.select({ c: count() }).from(bestAndFairest).where(eq(bestAndFairest.grade, grade)),
  db.select({ c: count() }).from(coachesVotes).where(eq(coachesVotes.grade, grade)),
]);
const totals = { bf: bfRow.c, coaches: cvRow.c };
```

Then update the two return statements to include `totals`:

```typescript
// pivot branch:
return NextResponse.json({ mode: "pivot", rows: buildPivot(entries, usedRounds), rounds: usedRounds, totals });

// single round branch:
return NextResponse.json({ mode: "round", rows: buildLeaderboard(entries, round), rounds: [], totals });
```

Also update the early-return for empty scoped teams to include totals:

```typescript
if (scopedTeamNames.length === 0) return NextResponse.json({ rows: [], rounds: [], totals: { bf: 0, coaches: 0 } });
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/leaderboard/route.ts
git commit -m "feat: add submission totals to leaderboard API response"
```

---

## Task 6: Render totals footer on leaderboard page

**Files:**
- Modify: `app/admin/leaderboard/page.tsx`
- Modify: `app/admin/leaderboard/leaderboard.module.css`

- [ ] **Step 1: Update `ApiResponse` type to include totals**

In `app/admin/leaderboard/page.tsx`, update the `ApiResponse` type:

```typescript
type ApiResponse =
  | { mode: "round"; rows: RoundRow[]; rounds: string[]; totals: { bf: number; coaches: number } }
  | { mode: "pivot"; rows: PivotRow[]; rounds: string[]; totals: { bf: number; coaches: number } };
```

- [ ] **Step 2: Add totals footer below the table**

In the JSX, after the closing block of the `isEmpty ? ... : data.mode === "pivot" ? ... : ...` ternary expression (after the last `)`), add:

```tsx
{data && (
  <p className={styles.totals}>
    Best &amp; Fairest submissions: <strong>{data.totals.bf}</strong>
    &nbsp;·&nbsp;
    Coaches Vote submissions: <strong>{data.totals.coaches}</strong>
  </p>
)}
```

The full bottom of the component should look like:

```tsx
      {loading ? (
        <p className={styles.hint}>Loading…</p>
      ) : isEmpty ? (
        <p className={styles.hint}>No votes found for the selected filters.</p>
      ) : data.mode === "pivot" ? (
        /* ── Pivot table: All rounds ─────────────────────────────── */
        <div className={styles.tableWrap}>
          {/* ... existing pivot table JSX unchanged ... */}
        </div>
      ) : (
        /* ── Single round table ──────────────────────────────────── */
        <table className={styles.table}>
          {/* ... existing single round table JSX unchanged ... */}
        </table>
      )}

      {data && (
        <p className={styles.totals}>
          Best &amp; Fairest submissions: <strong>{data.totals.bf}</strong>
          &nbsp;·&nbsp;
          Coaches Vote submissions: <strong>{data.totals.coaches}</strong>
        </p>
      )}
```

- [ ] **Step 3: Add `.totals` CSS**

In `app/admin/leaderboard/leaderboard.module.css`, append:

```css
.totals { margin-top: 14px; font-size: 13px; color: var(--muted); }
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/leaderboard/page.tsx app/admin/leaderboard/leaderboard.module.css
git commit -m "feat: show BnF and CoachesVotes submission totals on leaderboard"
```

---

## Verification

- [ ] Navigate to `/admin/votes` as superadmin — page loads with Competition + Grade dropdowns
- [ ] Select SFL → pick a grade that has BnF submissions → cards appear grouped by round; CoachesVotes section shows "No submissions"
- [ ] Select "SFL Community League Senior Men" → both BnF and CoachesVotes cards appear
- [ ] Select STJFL → CoachesVotes section shows "No submissions" (no CV grades for STJFL)
- [ ] Navigate to `/admin/leaderboard` → select a grade → totals footer appears below the table showing counts for both types
- [ ] Log in as club admin → navigating to `/admin/votes` returns 403
- [ ] "Votes" link visible in sidebar for superadmin, absent for club admin
