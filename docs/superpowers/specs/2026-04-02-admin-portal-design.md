# Admin Portal Design

**Date:** 2026-04-02
**Status:** Approved

## Overview

An admin portal for the SFL Football Web App, accessible at `/admin`, built inside the existing Next.js app. Two admin roles control access: a superadmin who sees everything, and a club admin scoped to their club and league. Authentication uses NextAuth.js with a credentials provider (username + password), with OAuth support possible in a future iteration.

---

## Roles

| Role | Scope |
|---|---|
| `superadmin` | All leagues, all clubs, all vote types |
| `club_admin` | Their club's teams in their league only; Best & Fairest votes only |

A club admin account is bound to a `(club_id, league_id)` pair. If a club operates in both SFL and STJFL, they get separate admin accounts — one per league.

---

## Architecture

### Authentication
- **Library:** NextAuth.js with the Credentials provider
- **Password storage:** bcrypt-hashed in `admin_users` table
- **Session shape:** JWT containing `userId`, `role`, `clubId` (null for superadmin), `leagueId` (null for superadmin)
- **Route protection:** `middleware.ts` at the project root intercepts all `/admin/**` requests; unauthenticated requests redirect to `/admin/login`
- **API protection:** Every `/api/admin/**` route checks the session server-side before returning data

### Route Structure
```
/admin/login           public — login form
/admin/leaderboard     superadmin + club_admin
/admin/access-codes    superadmin + club_admin (scoped)
/admin/fixtures        superadmin only
/admin/sync            superadmin only
/admin/alerts          superadmin + club_admin (scoped)
/api/admin/**          all protected by session check
```

### Sidebar Items by Role
| Section | Superadmin | Club Admin |
|---|---|---|
| Leaderboard | B&F + Coaches tabs | B&F tab only |
| Access Codes | All clubs | Their club only |
| Fixtures | ✓ | — |
| Sync | ✓ | — |
| Alerts | All clubs | Their club only |

---

## Schema Changes

### New table: `clubs`
```sql
CREATE TABLE clubs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  playhq_id  TEXT    UNIQUE   -- PlayHQ club organisation ID
);
```

`playhq_id` is the club's organisation ID from PlayHQ. Used by the cron sync to upsert clubs without creating duplicates. `NULL` for manually-seeded clubs until the sync is extended.

### New table: `admin_users`
```sql
CREATE TABLE admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK(role IN ('superadmin', 'club_admin')),
  club_id       INTEGER REFERENCES clubs(id),   -- NULL for superadmin
  league_id     INTEGER REFERENCES leagues(id)  -- NULL for superadmin
);
```

### Modified: `teams`
```sql
ALTER TABLE teams ADD COLUMN club_id INTEGER REFERENCES clubs(id);
```

`club_id` is `NULL` until clubs are populated. Superadmin works fully regardless; club admin scoped views are empty until teams are linked.

---

## Club Data Sourcing

Team names alone are not a reliable way to extract parent clubs — "Port Senior Women" and "Cygnet Senior Men" belong to the same club, which name-stripping cannot detect.

**Full automation approach** — three PlayHQ queries chained together:

**Step 1 — Search for all clubs** (run once per league):
```graphql
search(filter: {
  meta: { limit: 30, page: 1 },
  organisation: { query: "(sfl) tas", types: ["CLUB"], sports: ["AFL"] }
})
```
Returns each club with `id`, `name`, and `routingCode`. The `routingCode` is the `organisationId` used in subsequent queries. Repeat with `"(stjfl) tas"` for STJFL clubs.

**Step 2 — Get each club's teams for the season:**
```graphql
discoverOrganisationTeams(
  seasonCode: $seasonId,
  seasonId: $seasonId,
  organisationCode: $routingCode,
  organisationId: $routingCode
)
```
Returns `discoverTeams[]` with team `name` and `grade.name`, and `discoverOrganisation.name` for the club name. Filter results by `ALLOWED_GRADES` to exclude teams from other seasons or competitions.

**Step 3 — Upsert into DB:**
- Upsert `clubs` by `playhq_id = routingCode` (name comes from `discoverOrganisation.name`)
- For each team, match against `teams` table by `(name, grade_name)` and set `teams.club_id`

This runs as an additional step in the cron sync, after the existing fixtures/teams sync. The `ALLOWED_GRADES` filter ensures teams outside the tracked grades are ignored automatically.

---

## Features

### Leaderboard (`/admin/leaderboard`)

**Best & Fairest tab** — available to both roles.
- Filters: grade (dropdown), round (single round or "All Rounds" for season aggregate)
- Club admin: results filtered to rows where `home_team` matches one of their club's teams in their league
- Table: rank, player name, player number, team, round votes, total votes
- CSV export button downloads the current filtered view

**Coaches Votes tab** — superadmin only.
- Same filter structure and table shape as B&F tab
- Not visible to club admins

### Access Codes (`/admin/access-codes`)

Table of teams with their current access code and active status.
- Club admin sees only their club's teams in their league
- Actions per row:
  - **Copy** — copies code to clipboard
  - **Regenerate** — replaces code with a new random one (same format: `XXXX-XXXX`)
  - **Toggle active/inactive** — deactivates without deleting

### Fixtures (`/admin/fixtures`) — superadmin only

Read-only table of all synced fixtures. Filters: grade, round. Used to debug opposition auto-fill issues on the vote forms.

### Sync (`/admin/sync`) — superadmin only

Single "Run PlayHQ Sync" button. Calls `/api/cron/sync` server-side, bypassing the `CRON_SECRET` check (request is internal and already authenticated via admin session). Displays the full sync log inline after completion.

### Alerts (`/admin/alerts`)

Flags duplicate submissions:
- **B&F:** same `(grade, round, home_team)` has more than one submission
- **Coaches votes:** same `(grade, round, coach_team)` has more than one submission

Columns: vote type, grade, round, team, submission count, dates submitted.
- Superadmin can delete a specific submission from this view
- Club admin sees only their club's alerts, delete action not available

---

## Dependencies and Blockers

| Item | Status | Notes |
|---|---|---|
| PlayHQ club org query | Resolved | `search` + `discoverOrganisationTeams` chain is fully defined |
| `clubs` table seeded | Pending | Populated by cron sync using the queries above |
| NextAuth.js added | Pending | New dependency — `next-auth` + `bcryptjs` |
| Migration for `clubs`, `admin_users`, `teams.club_id` | Pending | New migration via drizzle-kit |

---

## Out of Scope

- OAuth login (designed for, not built now)
- Admin user management UI (admin accounts created via seed script or direct DB insert for now)
- STJFL data in leaderboards (STJFL teams are hardcoded; no votes flow through the system for them yet)
