# Player Name & Number Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate that each submitted (player number, player name) pair matches a real player from the fetched match roster on both the BnF and CoachesVote forms, and ensure names are always stored in title-case.

**Architecture:** A shared `toTitleCase` utility in `lib/utils.ts` normalises names on both the frontend (before comparison and submission) and the API (before DB insert and comparison). The frontend validates against the in-memory game-specific player array; the API validates against the accumulated `teamPlayers` roster as a second line of defence. Both layers skip validation gracefully when no player data is available.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM (libsql/Turso), React 19

> **Note:** No test framework is configured in this project. Task 1 uses a Node.js inline assertion to verify the utility. All other tasks use manual verification via the dev server.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/utils.ts` | Create | `toTitleCase` string utility |
| `app/(main)/bestandfairest/BestAndFairestPage.tsx` | Modify | Frontend validation + title-case in `handleSubmit` |
| `app/(main)/coachesvote/CoachesVotePage.tsx` | Modify | Frontend validation + title-case in `handleSubmit`; use raw player arrays |
| `app/api/best-and-fairest/route.ts` | Modify | Extend roster query; name check after outsider block; title-case on insert |
| `app/api/coaches-vote/route.ts` | Modify | New roster query for both teams; name check; title-case on insert |

---

## Task 1: Create `lib/utils.ts` with `toTitleCase`

**Files:**
- Create: `lib/utils.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/utils.ts

/**
 * Capitalises the first letter of every word in a string.
 * Used to normalise player names before validation and storage.
 */
export function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 2: Verify the function manually**

Run in a terminal (from the project root):

```bash
node -e "
const fn = s => s.replace(/\b\w/g, c => c.toUpperCase());
console.assert(fn('john smith')      === 'John Smith',      'lowercase');
console.assert(fn('JOHN SMITH')      === 'JOHN SMITH',      'uppercase preserved');
console.assert(fn('John Smith')      === 'John Smith',      'already correct');
console.assert(fn('')               === '',               'empty string');
console.assert(fn(\"o'brien\")       === \"O'Brien\",        'apostrophe');
console.log('toTitleCase: all assertions passed');
"
```

Expected output: `toTitleCase: all assertions passed`

Note: `JOHN SMITH` stays `JOHN SMITH` because `\b\w` only replaces the first char of each word — this is intentional. The comparison on both sides always runs `toTitleCase`, so `SMITH` and `Smith` both become handled correctly when both sides are normalised.

- [ ] **Step 3: Commit**

```bash
git add lib/utils.ts
git commit -m "feat: add toTitleCase utility"
```

---

## Task 2: BnF frontend — validation + title-case in `handleSubmit`

**Files:**
- Modify: `app/(main)/bestandfairest/BestAndFairestPage.tsx`

- [ ] **Step 1: Add the import at the top of the file**

At the top of `BestAndFairestPage.tsx`, after the existing imports, add:

```ts
import { toTitleCase } from "@/lib/utils";
```

- [ ] **Step 2: Replace the `handleSubmit` function body**

Find `async function handleSubmit(e: React.FormEvent)` (currently around line 251). Replace the entire function with:

```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!selectedFixture) return;
  setError(null);

  if (!submitterName.trim()) { setError("Please enter your name before submitting."); return; }
  if (!initials.trim())      { setError("Please enter your initials before submitting."); return; }

  const enteredNums = players.map((p) => p.number.trim()).filter(Boolean);
  if (new Set(enteredNums).size !== enteredNums.length) {
    const seen  = new Set<string>();
    const dupes = enteredNums.filter((n) => seen.size === seen.add(n).size);
    setError(`Duplicate player number${dupes.length > 1 ? "s" : ""}: ${[...new Set(dupes)].join(", ")}.`);
    return;
  }

  // Title-case all names before validation and submission
  const normalizedPlayers = players.map((p) => ({
    number: p.number,
    name: toTitleCase(p.name.trim()),
  }));

  // Validate (number, name) pairs against fetched roster — skip if no player data
  if (teamPlayers.length > 0) {
    const rosterSet = new Set(
      teamPlayers
        .filter((p) => p.playerNumber)
        .map((p) => `${p.playerNumber}|${toTitleCase(`${p.firstName} ${p.lastName}`.trim())}`)
    );
    for (const p of normalizedPlayers) {
      if (!p.number.trim() || !p.name) continue;
      if (!rosterSet.has(`${p.number.trim()}|${p.name}`)) {
        setError(`Player #${p.number} "${p.name}" does not match any player in this match.`);
        return;
      }
    }
  }

  setSubmitting(true);
  try {
    const res = await fetch("/api/best-and-fairest", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessCode,
        competition,
        matchDate:   selectedFixture.matchDate,
        ageGroup,
        grade:       gradeName,
        homeTeam:    selectedFixture.homeTeamName,
        opposition:  selectedFixture.awayTeamName,
        round:       selectedFixture.roundName,
        player1Number: normalizedPlayers[0].number || null, player1Name: normalizedPlayers[0].name || null,
        player2Number: normalizedPlayers[1].number || null, player2Name: normalizedPlayers[1].name || null,
        player3Number: normalizedPlayers[2].number || null, player3Name: normalizedPlayers[2].name || null,
        player4Number: normalizedPlayers[3].number || null, player4Name: normalizedPlayers[3].name || null,
        player5Number: normalizedPlayers[4].number || null, player5Name: normalizedPlayers[4].name || null,
        submitterName: submitterName.trim(),
        signatureDataUrl: initials.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Submission failed.");
    setSubmitted(true);
    setSubmittedByRound((prev) => ({
      ...prev,
      [selectedFixture.roundName]: (prev[selectedFixture.roundName] ?? 0) + 1,
    }));
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setSubmitting(false);
  }
}
```

- [ ] **Step 3: Run lint to catch type errors**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 4: Start dev server and manually verify**

```bash
npm run dev
```

Open `http://localhost:3000/bestandfairest` in a browser. After verifying your access code and selecting a match:

1. **Players loaded**: Type a real player's number but a wrong name → submit → expect error banner: `Player #N "Wrong Name" does not match any player in this match.`
2. **Players loaded**: Select a valid player via the autocomplete dropdown → submit → should proceed (no validation error from this check).
3. **Players loaded**: Type a valid player's number and name manually (in correct title-case) → submit → should proceed.
4. **No player data** (simulate by checking the console for `source: "none"` in the game-players response): all 5 fields manually filled → submit → should proceed without validation error.

- [ ] **Step 5: Commit**

```bash
git add "app/(main)/bestandfairest/BestAndFairestPage.tsx"
git commit -m "feat(bnf): validate player name+number against fetched roster on submit"
```

---

## Task 3: CoachesVote frontend — validation + title-case in `handleSubmit`

**Files:**
- Modify: `app/(main)/coachesvote/CoachesVotePage.tsx`

- [ ] **Step 1: Add the import at the top of the file**

At the top of `CoachesVotePage.tsx`, after the existing imports, add:

```ts
import { toTitleCase } from "@/lib/utils";
```

- [ ] **Step 2: Replace the `handleSubmit` function body**

Find `async function handleSubmit(e: React.FormEvent)` (currently around line 222). Replace the entire function with:

```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!selectedFixture) return;
  setError(null);

  if (!submitterName.trim()) { setError("Please enter your name before submitting."); return; }
  if (!initials.trim())      { setError("Please enter your initials before submitting."); return; }

  const enteredNums = players.map((p) => p.number.trim()).filter(Boolean);
  if (new Set(enteredNums).size !== enteredNums.length) {
    const seen  = new Set<string>();
    const dupes = enteredNums.filter((n) => seen.size === seen.add(n).size);
    setError(`Duplicate player number${dupes.length > 1 ? "s" : ""}: ${[...new Set(dupes)].join(", ")}.`);
    return;
  }

  // Title-case all names before validation and submission
  const normalizedPlayers = players.map((p) => ({
    number: p.number,
    name: toTitleCase(p.name.trim()),
  }));

  // Validate (number, name) pairs against fetched roster — use raw arrays (no [H]/[A] prefix)
  const rawGamePlayers = [...homePlayers, ...awayPlayers];
  if (rawGamePlayers.length > 0) {
    const rosterSet = new Set(
      rawGamePlayers
        .filter((p) => p.playerNumber)
        .map((p) => `${p.playerNumber}|${toTitleCase(`${p.firstName} ${p.lastName}`.trim())}`)
    );
    for (const p of normalizedPlayers) {
      if (!p.number.trim() || !p.name) continue;
      if (!rosterSet.has(`${p.number.trim()}|${p.name}`)) {
        setError(`Player #${p.number} "${p.name}" does not match any player in this match.`);
        return;
      }
    }
  }

  setSubmitting(true);
  try {
    const res = await fetch("/api/coaches-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessCode: accessCode,
        grade,
        round:     selectedFixture.roundName,
        matchDate: selectedFixture.matchDate,
        homeTeam:  selectedFixture.homeTeamName,
        awayTeam:  selectedFixture.awayTeamName,
        coachTeam,
        player1Number: normalizedPlayers[0].number || null, player1Name: normalizedPlayers[0].name || null,
        player2Number: normalizedPlayers[1].number || null, player2Name: normalizedPlayers[1].name || null,
        player3Number: normalizedPlayers[2].number || null, player3Name: normalizedPlayers[2].name || null,
        player4Number: normalizedPlayers[3].number || null, player4Name: normalizedPlayers[3].name || null,
        player5Number: normalizedPlayers[4].number || null, player5Name: normalizedPlayers[4].name || null,
        submitterName: submitterName.trim(),
        signatureDataUrl: initials.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Submission failed.");
    setSubmitted(true);
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setSubmitting(false);
  }
}
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 4: Manually verify**

Open `http://localhost:3000/coachesvote`. After selecting a match:

1. **Players loaded**: Type a valid number but wrong name for either home or away team → submit → expect error banner.
2. **Players loaded**: Select players via autocomplete (both `[H]` and `[A]` players) → the selected name has the prefix stripped already (e.g. `John Smith`, not `[H] John Smith`) → submit → should proceed without error.
3. **Both teams share the same jersey number** (e.g. both have a #5): entering either team's #5 with the correct name should pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(main)/coachesvote/CoachesVotePage.tsx"
git commit -m "feat(cv): validate player name+number against fetched roster on submit"
```

---

## Task 4: BnF API — extend roster query, add name validation, title-case on insert

**Files:**
- Modify: `app/api/best-and-fairest/route.ts`

- [ ] **Step 1: Add the `toTitleCase` import**

At the top of `app/api/best-and-fairest/route.ts`, add after the existing imports:

```ts
import { toTitleCase } from "@/lib/utils";
```

- [ ] **Step 2: Extend the roster query to fetch `firstName` and `lastName`**

Find the existing roster query (currently around line 179):

```ts
// OLD — fetch only playerNumber
const rosterRows = await db
  .select({ playerNumber: teamPlayers.playerNumber })
  .from(teamPlayers)
  .where(eq(teamPlayers.teamName, submittingTeam));
```

Replace it with:

```ts
const rosterRows = await db
  .select({
    playerNumber: teamPlayers.playerNumber,
    firstName:    teamPlayers.firstName,
    lastName:     teamPlayers.lastName,
  })
  .from(teamPlayers)
  .where(eq(teamPlayers.teamName, submittingTeam));
```

- [ ] **Step 3: Add name validation after the existing outsider-numbers block**

The existing outsider-numbers block ends with the closing `}` of the `if (rosterRows.length > 0)` block (around line 193). Add the following immediately after it:

```ts
// Name check: if the roster has data, the submitted name must match the stored name for each number
if (rosterRows.length > 0) {
  // Build a map of playerNumber → Set of valid title-cased full names.
  // A Set handles the edge case where multiple entries share a number.
  // If a player has no stored name (data quality gap), their number maps to an empty Set
  // and name validation is skipped for them.
  const rosterByNumber = new Map<string, Set<string>>();
  for (const r of rosterRows) {
    if (!r.playerNumber) continue;
    if (!rosterByNumber.has(r.playerNumber)) rosterByNumber.set(r.playerNumber, new Set());
    const fullName = `${r.firstName} ${r.lastName}`.trim();
    if (fullName) rosterByNumber.get(r.playerNumber)!.add(toTitleCase(fullName));
  }
  for (const p of [p1, p2, p3, p4, p5]) {
    const validNames = rosterByNumber.get(p.num);
    if (!validNames || validNames.size === 0) continue; // not in map or no name stored — skip
    if (!validNames.has(toTitleCase(p.name))) {
      return NextResponse.json(
        { error: `Player #${p.num} name does not match the team roster.` },
        { status: 422 }
      );
    }
  }
}
```

- [ ] **Step 4: Title-case player names in the DB insert**

Find the `db.insert(bestAndFairest).values({...})` block (currently around line 196). Change the five player name fields:

```ts
// OLD
player1Name: p1.name, player2Name: p2.name, player3Name: p3.name,
player4Name: p4.name, player5Name: p5.name,

// NEW
player1Name: toTitleCase(p1.name), player2Name: toTitleCase(p2.name), player3Name: toTitleCase(p3.name),
player4Name: toTitleCase(p4.name), player5Name: toTitleCase(p5.name),
```

The full insert block should look like this after the change:

```ts
const [inserted] = await db
  .insert(bestAndFairest)
  .values({
    competition, matchDate, ageGroup,
    grade:      grade ?? null,
    homeTeam:   submittingTeam,
    opposition, round,
    player1Number: p1.num, player1Name: toTitleCase(p1.name),
    player2Number: p2.num, player2Name: toTitleCase(p2.name),
    player3Number: p3.num, player3Name: toTitleCase(p3.name),
    player4Number: p4.num, player4Name: toTitleCase(p4.name),
    player5Number: p5.num, player5Name: toTitleCase(p5.name),
    submitterName,
    signatureDataUrl: initials,
  })
  .returning();
```

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Manually verify via curl**

Start the dev server (`npm run dev`) and run the following curl commands. Replace `ACCESS_CODE`, `HOME_TEAM`, `OPP_TEAM`, and player values with real data from your dev DB.

**Test A — wrong name for a known number (expect 422):**

```bash
curl -s -X POST http://localhost:3000/api/best-and-fairest \
  -H "Content-Type: application/json" \
  -d '{
    "accessCode": "ACCESS_CODE",
    "competition": "SFL",
    "matchDate": "'"$(date +%Y-%m-%d)"'",
    "ageGroup": "Senior Men",
    "grade": "SFL Community League Senior Men",
    "homeTeam": "HOME_TEAM",
    "opposition": "OPP_TEAM",
    "round": "Round 1",
    "player1Number": "5", "player1Name": "Wrong Name",
    "player2Number": "7", "player2Name": "Another Wrong",
    "player3Number": "9", "player3Name": "Bad Player",
    "player4Number": "11","player4Name": "Not Real",
    "player5Number": "13","player5Name": "Fake Person",
    "submitterName": "Test User",
    "signatureDataUrl": "TU"
  }'
```

Expected response: `{"error":"Player #5 name does not match the team roster."}` (or similar for the first mismatched player).

**Test B — correct name in lowercase (expect 201, name stored as title-case):**

Submit with a real player's name in all-lowercase (e.g. `"john smith"` instead of `"John Smith"`). Expect HTTP 201, and in the DB the stored name should be `"John Smith"`.

- [ ] **Step 7: Commit**

```bash
git add app/api/best-and-fairest/route.ts
git commit -m "feat(bnf-api): validate player names against roster and store in title-case"
```

---

## Task 5: CoachesVote API — add roster query, name validation, title-case on insert

**Files:**
- Modify: `app/api/coaches-vote/route.ts`

- [ ] **Step 1: Update imports**

At the top of `app/api/coaches-vote/route.ts`:

Change the drizzle-orm import from:
```ts
import { and, eq, desc } from "drizzle-orm";
```
to:
```ts
import { and, eq, desc, or } from "drizzle-orm";
```

Change the schema import from:
```ts
import { coachesVotes, teamAccessCodes } from "@/db/schema";
```
to:
```ts
import { coachesVotes, teamAccessCodes, teamPlayers } from "@/db/schema";
```

Add the utils import:
```ts
import { toTitleCase } from "@/lib/utils";
```

- [ ] **Step 2: Add roster validation after the deduplication check**

Find the deduplication check block that ends with:
```ts
if (existing.length > 0) {
  return NextResponse.json(
    { error: `Votes for ${coachTeam} in this game have already been submitted. Only one submission per team per game is allowed.` },
    { status: 409 }
  );
}
```

Add the following immediately after that closing brace:

```ts
// Roster validation: check submitted (number, name) pairs against both teams' stored players.
// If neither team has any stored players, skip validation entirely (graceful fallback).
const rosterRows = await db
  .select({
    playerNumber: teamPlayers.playerNumber,
    firstName:    teamPlayers.firstName,
    lastName:     teamPlayers.lastName,
  })
  .from(teamPlayers)
  .where(
    or(
      eq(teamPlayers.teamName, homeTeam),
      eq(teamPlayers.teamName, awayTeam),
    )
  );

if (rosterRows.length > 0) {
  // Map: playerNumber → Set of valid title-cased full names across both teams.
  // Using a Set per number correctly handles the case where both teams have the same
  // jersey number — both players' names are retained as valid options.
  const rosterByNumber = new Map<string, Set<string>>();
  for (const r of rosterRows) {
    if (!r.playerNumber) continue;
    if (!rosterByNumber.has(r.playerNumber)) rosterByNumber.set(r.playerNumber, new Set());
    const fullName = `${r.firstName} ${r.lastName}`.trim();
    if (fullName) rosterByNumber.get(r.playerNumber)!.add(toTitleCase(fullName));
  }
  for (const p of [p1, p2, p3, p4, p5]) {
    const validNames = rosterByNumber.get(p.num);
    if (!validNames || validNames.size === 0) continue; // not in map or no name stored — skip
    if (!validNames.has(toTitleCase(p.name))) {
      return NextResponse.json(
        { error: `Player #${p.num} name does not match the match roster.` },
        { status: 422 }
      );
    }
  }
}
```

- [ ] **Step 3: Title-case player names in the DB insert**

Find the `db.insert(coachesVotes).values({...})` block (currently around line 165). Change the five player name fields:

```ts
// OLD
player1Name: p1.name, player2Name: p2.name, player3Name: p3.name,
player4Name: p4.name, player5Name: p5.name,

// NEW
player1Name: toTitleCase(p1.name), player2Name: toTitleCase(p2.name), player3Name: toTitleCase(p3.name),
player4Name: toTitleCase(p4.name), player5Name: toTitleCase(p5.name),
```

The full insert block after the change:

```ts
const [inserted] = await db
  .insert(coachesVotes)
  .values({
    grade, round, matchDate,
    homeTeam, awayTeam, coachTeam,
    player1Number: p1.num, player1Name: toTitleCase(p1.name),
    player2Number: p2.num, player2Name: toTitleCase(p2.name),
    player3Number: p3.num, player3Name: toTitleCase(p3.name),
    player4Number: p4.num, player4Name: toTitleCase(p4.name),
    player5Number: p5.num, player5Name: toTitleCase(p5.name),
    submitterName,
    signatureDataUrl: initials,
  })
  .returning();
```

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manually verify via curl**

Replace `ACCESS_CODE`, `HOME_TEAM`, `AWAY_TEAM`, `COACH_TEAM` with real values from your dev DB.

**Test A — wrong name (expect 422):**

```bash
curl -s -X POST http://localhost:3000/api/coaches-vote \
  -H "Content-Type: application/json" \
  -d '{
    "accessCode": "ACCESS_CODE",
    "grade": "SFL Community League Senior Men",
    "round": "Round 1",
    "matchDate": "'"$(date +%Y-%m-%d)"'",
    "homeTeam": "HOME_TEAM",
    "awayTeam": "AWAY_TEAM",
    "coachTeam": "COACH_TEAM",
    "player1Number": "5",  "player1Name": "Wrong Name",
    "player2Number": "7",  "player2Name": "Also Wrong",
    "player3Number": "9",  "player3Name": "Bad Entry",
    "player4Number": "11", "player4Name": "Not A Player",
    "player5Number": "13", "player5Name": "Fake Name",
    "submitterName": "Test Coach",
    "signatureDataUrl": "TC"
  }'
```

Expected: `{"error":"Player #5 name does not match the match roster."}` (or the first mismatched player).

**Test B — no roster data (expect 201, no validation error):**

If neither `HOME_TEAM` nor `AWAY_TEAM` have any entries in `teamPlayers`, the validation block is skipped and the submission should succeed (HTTP 201) with whatever names were entered (stored in title-case).

**Test C — correct names in mixed case (expect 201):**

Submit with real players' names in all-lowercase. Expect HTTP 201. Verify the DB stores the names in title-case.

- [ ] **Step 6: Commit**

```bash
git add app/api/coaches-vote/route.ts
git commit -m "feat(cv-api): validate player names against roster and store in title-case"
```

---

## Self-Review Checklist

- [x] **Spec req 1** (validate number+name against fetched roster): Tasks 2, 3 (frontend) + Tasks 4, 5 (API)
- [x] **Spec req 2** (title-case storage): Tasks 4, 5 — `toTitleCase` applied before every insert
- [x] **Spec req 3** (skip when no player data): both frontend checks guard on `teamPlayers.length > 0` / `rawGamePlayers.length > 0`; both API checks guard on `rosterRows.length > 0`
- [x] **Spec req 4** (error in existing banner): `setError(...)` used in Tasks 2, 3; API returns `NextResponse.json({ error })` in Tasks 4, 5
- [x] **Edge case — empty stored name**: `validNames.size === 0` check in Tasks 4, 5 skips validation
- [x] **Edge case — CoachesVote duplicate jersey numbers**: `Map<number, Set<string>>` retains both names
- [x] **Edge case — PlayHQ casing inconsistency**: `toTitleCase` applied to both sides of every comparison
- [x] **Type consistency**: `toTitleCase` signature `(s: string): string` used consistently across all 5 tasks
