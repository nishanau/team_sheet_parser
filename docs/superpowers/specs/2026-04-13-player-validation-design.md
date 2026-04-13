# Player Name & Number Validation Design

**Date**: 2026-04-13  
**Scope**: Best & Fairest and Coaches Vote submission flows

## Problem

Voters can type any player number and name into the vote form. Neither the frontend nor the API validates that the entered values correspond to a real player from the fetched match roster. Names also have no enforced casing, so the same player can be stored with different capitalisation across submissions.

## Requirements

1. When player data was successfully fetched for a game, each submitted `(number, name)` pair must match a real player in that fetched roster.
2. First and last names must always be stored in title-case (e.g. `John Smith`, not `john smith` or `JOHN SMITH`).
3. If the fetch returned no players (network failure, PlayHQ unavailable), validation is skipped and free-form entry is allowed — same as today.
4. Errors surface in the existing error banner at the bottom of the form (not inline per-row).

## Approach: Frontend validation + API defence in depth (Approach B)

The frontend has game-specific player data in memory; the API has the accumulated team roster in `teamPlayers`. Both layers validate, each within the granularity of data available to them.

## Design

### 1. Shared utility — `lib/utils.ts`

```ts
export function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
```

Used by both pages and both API routes.

### 2. Frontend validation (`handleSubmit` in both pages)

Location in the flow: after the existing duplicate-number check, before the `fetch` call.

```
1. Title-case each entered player name (mutate local copy before validation/submission)
2. If fetched players array is non-empty:
   For each of the 5 player entries:
     Build fullName = `${p.firstName} ${p.lastName}`.trim()
     Check: fetched players contains entry where
       playerNumber === enteredNumber  AND
       toTitleCase(fullName) === titleCasedEnteredName
     If no match → setError("Player #N 'Name' does not match any player in this match.") and return
3. If fetched players array is empty → skip validation
```

**BnF**: validates against `teamPlayers: GamePlayer[]` (single team, no prefix).

**CoachesVote**: validates against `[...homePlayers, ...awayPlayers]` — the raw arrays, **not** `allGamePlayers` (which has `[H]`/`[A]` prefixes on `firstName` for UI purposes). The form state already stores the stripped name, so this comparison is clean.

### 3. API validation & name normalisation

#### BnF (`/api/best-and-fairest/route.ts`)

The existing roster query fetches only `playerNumber`. Extend it to also select `firstName` and `lastName`.

After the existing "outsider numbers" block, add:

```
For each submitted player:
  Find rosterRow where rosterRow.playerNumber === submittedNumber
  If found:
    storedFullName = toTitleCase(`${rosterRow.firstName} ${rosterRow.lastName}`.trim())
    submittedFullName = toTitleCase(submittedName)
    If storedFullName !== submittedFullName → 422 "Player #N name does not match roster."
If rosterRows.length === 0 → skip (same fallback as existing number check)
```

Apply `toTitleCase` to all player names before the DB insert.

#### CoachesVote (`/api/coaches-vote/route.ts`)

Add a new roster query for both teams:

```
rosterRows = SELECT playerNumber, firstName, lastName FROM teamPlayers
             WHERE teamName IN (homeTeam, awayTeam)
```

Build a `Set<string>` of `"${playerNumber}|${toTitleCase(fullName)}"` tuples from all roster rows (both teams). This correctly handles the common case where both teams share the same jersey number — both entries are retained in the set.

For each submitted player:
  - If set is non-empty → check `"${submittedNumber}|${titleCasedName}"` is in the set; if not → 422
  - If set is empty → skip

Apply `toTitleCase` to all player names before the DB insert.

## Files Changed

| File | Change |
|------|--------|
| `lib/utils.ts` | New — `toTitleCase` utility |
| `app/(main)/bestandfairest/BestAndFairestPage.tsx` | Add validation + title-case in `handleSubmit` |
| `app/(main)/coachesvote/CoachesVotePage.tsx` | Add validation + title-case in `handleSubmit`; use raw `homePlayers`/`awayPlayers` for validation |
| `app/api/best-and-fairest/route.ts` | Extend roster query; add name check; title-case names before insert |
| `app/api/coaches-vote/route.ts` | Add roster query for both teams; add name check; title-case names before insert |

## Edge Cases

- **Empty number or name**: already caught by existing "required" checks in both APIs.
- **Roster has player number but no name stored** (firstName + lastName both empty): skip name validation for that player — don't block submission over a data quality gap in the roster.
- **CoachesVote combined roster conflict** (same number on both teams): using a `Set` of `number|name` tuples means both entries are retained — both names are valid for that number, and either passes validation.
- **PlayHQ name casing inconsistency**: both sides of the comparison are run through `toTitleCase` before comparing, so `SMITH` and `Smith` are treated identically.
