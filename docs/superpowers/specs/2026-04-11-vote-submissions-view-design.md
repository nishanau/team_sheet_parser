# Vote Submissions View — Design Spec

**Date:** 2026-04-11  
**Status:** Approved

---

## Context

Admins currently have a leaderboard that shows aggregated vote tallies per player, but no way to audit raw vote submissions. This feature adds a superadmin-only page (`/admin/votes`) that surfaces every individual BnF and CoachesVotes submission as a browsable card, grouped by round. It also adds a submission count footer to the existing leaderboard table so admins can quickly see how many votes have been cast without leaving the leaderboard.

---

## New Page: `/admin/votes`

### Access
- Superadmin only — 403 for club admins
- New "Votes" link added to `AdminNav.tsx` (rendered only for superadmin)

### Filters
- **Competition** dropdown: SFL / STJFL
- **Grade** dropdown: dynamically populated based on competition selection, using the same role-scoped grade logic as the existing leaderboard page (only grades relevant to the selected competition are shown)
- Both dropdowns required before data loads

### Layout
Two stacked sections, rendered after grade is selected:

1. **Best & Fairest Submissions**
2. **Coaches Votes Submissions**

Within each section:
- Cards grouped under **round headings** (Round 1, Round 2, …), sorted by round number ascending
- Within each round, cards sorted by `createdAt` ascending
- Empty state: "No submissions" message when no records exist for the selected grade

---

## Card Design

### BnF Card
```
[ Submitting Team vs Opposition ]  [ Round X ]  [ Match Date ]
[ Competition · Age Group ]

1. #12 John Smith    — 5 votes
2. #7  Jane Doe      — 4 votes
3. #3  Tom Jones     — 3 votes
4. #21 Sam Lee       — 2 votes
5. #9  Alex Brown    — 1 vote

Submitted by: [submitterName]  ·  [createdAt]
```

### CoachesVotes Card
```
[ Home Team vs Away Team ]  [ Round X ]  [ Match Date ]
[ Coach Team badge ]

1. #4  Player Name   — 5 votes
2. #11 Player Name   — 4 votes
3. #8  Player Name   — 3 votes
4. #2  Player Name   — 2 votes
5. #15 Player Name   — 1 vote

Submitted by: [submitterName]  ·  [createdAt]
```

---

## New API: `GET /api/admin/votes`

**Query params:** `competition`, `grade`  
**Auth:** Superadmin only (NextAuth session required)

**Response:**
```typescript
{
  bf: {
    id: number
    competition: string
    matchDate: string
    ageGroup: string
    grade: string
    round: string
    submittingTeam: string
    opposition: string
    player1Number: string; player1Name: string
    player2Number: string; player2Name: string
    player3Number: string; player3Name: string
    player4Number: string; player4Name: string
    player5Number: string; player5Name: string
    submitterName: string
    createdAt: string
  }[]
  coaches: {
    id: number
    grade: string
    round: string
    matchDate: string
    homeTeam: string
    awayTeam: string
    coachTeam: string
    player1Number: string; player1Name: string
    player2Number: string; player2Name: string
    player3Number: string; player3Name: string
    player4Number: string; player4Name: string
    player5Number: string; player5Name: string
    submitterName: string
    createdAt: string
  }[]
}
```

---

## Leaderboard Change: Submission Totals Footer

On the existing `/admin/leaderboard` page, add a summary footer **below the leaderboard table** showing:

```
Best & Fairest submissions: 42   |   Coaches Vote submissions: 18
```

**Implementation:** Add `totals: { bf: number, coaches: number }` to the existing leaderboard API response (`/api/admin/leaderboard`). The counts reflect the number of raw submission records in each table for the selected grade (regardless of which tab is active).

---

## Files to Create / Modify

| File | Action |
|---|---|
| `app/admin/votes/page.tsx` | Create — new page component |
| `app/api/admin/votes/route.ts` | Create — new API endpoint |
| `app/admin/AdminNav.tsx` | Modify — add Votes link for superadmin |
| `app/api/admin/leaderboard/route.ts` | Modify — add `totals` to response |
| `app/admin/leaderboard/page.tsx` | Modify — render totals footer |

---

## Verification

1. Navigate to `/admin/votes` as superadmin — page loads with Competition/Grade dropdowns
2. Select SFL → pick a grade → BnF cards appear grouped by round
3. Select an SFL Community League grade → both BnF and CoachesVotes cards appear
4. Select STJFL grade → CoachesVotes section shows "No submissions"
5. Navigate to leaderboard — footer below table shows BnF and Coaches submission counts for selected grade
6. Club admin navigating to `/admin/votes` receives 403
