import { integer, text, sqliteTable, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Leagues ──────────────────────────────────────────────────────────────────
// e.g. SFL, STJFL
export const leagues = sqliteTable("leagues", {
  id:   integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),   // "SFL" | "STJFL"
});

export const leaguesRelations = relations(leagues, ({ many }) => ({
  teams: many(teams),
}));

export type LeagueInsert = typeof leagues.$inferInsert;
export type LeagueSelect = typeof leagues.$inferSelect;

// ─── Clubs ────────────────────────────────────────────────────────────────────
// Parent organisation that may field teams across multiple leagues and grades.
// playhqId is the club's routingCode from the PlayHQ search API.
export const clubs = sqliteTable("clubs", {
  id:       integer("id").primaryKey({ autoIncrement: true }),
  name:     text("name").notNull().unique(),
  playhqId: text("playhq_id").unique(),
});

export type ClubInsert = typeof clubs.$inferInsert;
export type ClubSelect = typeof clubs.$inferSelect;

// ─── Admin Users ──────────────────────────────────────────────────────────────
// role "superadmin" → clubId and leagueId are null (sees everything)
// role "club_admin"  → scoped to (clubId, leagueId)
export const adminUsers = sqliteTable("admin_users", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  username:     text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role:         text("role", { enum: ["superadmin", "club_admin"] }).notNull(),
  clubId:       integer("club_id").references(() => clubs.id),
  leagueId:     integer("league_id").references(() => leagues.id),
});

export type AdminUserInsert = typeof adminUsers.$inferInsert;
export type AdminUserSelect = typeof adminUsers.$inferSelect;

// ─── Teams ────────────────────────────────────────────────────────────────────
// A team belongs to a league. ageGroup scopes which division they play in.
export const teams = sqliteTable("teams", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  leagueId:  integer("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  gradeName: text("grade_name"),   // PlayHQ grade e.g. "SFL Premier League Senior Men"; null = STJFL fallback
  clubId:    integer("club_id").references(() => clubs.id),
  playhqId:  text("playhq_id").unique(),  // PlayHQ team ID from ladder — used to link club_id definitively
});

export const teamsRelations = relations(teams, ({ one }) => ({
  league: one(leagues, { fields: [teams.leagueId], references: [leagues.id] }),
}));

export type TeamInsert = typeof teams.$inferInsert;
export type TeamSelect = typeof teams.$inferSelect;

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// Synced from PlayHQ scraped data. Used to auto-fill Round/Date/Opposition.
export const fixtures = sqliteTable("fixtures", {
  id:           text("id").primaryKey(),              // PlayHQ game id
  gradeName:    text("grade_name").notNull(),          // "SFL Premier League Senior Men"
  roundName:    text("round_name").notNull(),          // "Round 5"
  matchDate:    text("match_date").notNull(),          // YYYY-MM-DD
  homeTeamName: text("home_team_name").notNull(),
  awayTeamName: text("away_team_name").notNull(),
  venueName:    text("venue_name"),
}, (t) => [
  index("fixtures_grade_home_round_idx").on(t.gradeName, t.homeTeamName, t.roundName),
  index("fixtures_grade_away_idx").on(t.gradeName, t.awayTeamName),
]);

export type FixtureInsert = typeof fixtures.$inferInsert;
export type FixtureSelect = typeof fixtures.$inferSelect;

// ─── Team Players ─────────────────────────────────────────────────────────────
// One row per player per team — upserted whenever a new game is processed.
// Keyed on (team_name, profile_id) for registered players, or
// (team_name, first_name, last_name) for anonymous/fill-in players.
export const teamPlayers = sqliteTable("team_players", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  teamName:     text("team_name").notNull(),
  playerNumber: text("player_number"),
  firstName:    text("first_name").notNull(),
  lastName:     text("last_name").notNull(),
  profileId:    text("profile_id"),              // null for fill-ins / anonymous
  lastSeenGameId: text("last_seen_game_id"),      // audit: most recent game this player appeared in
}, (t) => [
  index("team_players_team_name_idx").on(t.teamName),
  index("team_players_team_profile_idx").on(t.teamName, t.profileId),
  index("team_players_team_firstname_lastname_idx").on(t.teamName, t.firstName, t.lastName),
]);

export type TeamPlayerInsert = typeof teamPlayers.$inferInsert;
export type TeamPlayerSelect = typeof teamPlayers.$inferSelect;

// ─── Game Players Fetched ─────────────────────────────────────────────────────
// Tracks which (game_id, team_name) combos have already been pulled from PlayHQ.
// Prevents duplicate API calls while still merging new players on new games.
export const gamePlayersFetched = sqliteTable("game_players_fetched", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  gameId:    text("game_id").notNull(),
  teamName:  text("team_name").notNull(),
  fetchedAt: text("fetched_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (t) => [
  index("gpf_game_team_idx").on(t.gameId, t.teamName),
]);

// ─── Best & Fairest Votes ─────────────────────────────────────────────────────
export const bestAndFairest = sqliteTable("best_and_fairest", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  competition: text("competition").notNull(),           // "SFL" | "STJFL"
  matchDate:   text("match_date").notNull(),            // YYYY-MM-DD (Tasmania time)
  ageGroup:    text("age_group").notNull(),
  grade:       text("grade"),                          // e.g. "SFL Premier League Senior Men"
  opposition:  text("opposition").notNull(),
  homeTeam:    text("home_team"),                       // team submitter coaches
  round:       text("round").notNull(),                 // e.g. "Round 1"

  // 5 vote entries: position 1 = 5 votes … position 5 = 1 vote
  player1Number: text("player1_number"),
  player1Name:   text("player1_name"),
  player2Number: text("player2_number"),
  player2Name:   text("player2_name"),
  player3Number: text("player3_number"),
  player3Name:   text("player3_name"),
  player4Number: text("player4_number"),
  player4Name:   text("player4_name"),
  player5Number: text("player5_number"),
  player5Name:   text("player5_name"),

  // Submission sign-off
  submitterName:    text("submitter_name").notNull(),
  signatureDataUrl: text("signature_data_url"),         // submitter initials text

  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type BestAndFairestInsert = typeof bestAndFairest.$inferInsert;
export type BestAndFairestSelect = typeof bestAndFairest.$inferSelect;

// ─── Coaches Votes ────────────────────────────────────────────────────────────
// SFL Community League Senior Men / Senior Women only.
// One submission per (grade, round, homeTeam, awayTeam, coachTeam) — enforced
// by the API without requiring authentication.
export const coachesVotes = sqliteTable("coaches_votes", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  grade:       text("grade").notNull(),           // "SFL Community League Senior Men" | "…Women"
  round:       text("round").notNull(),
  matchDate:   text("match_date").notNull(),       // YYYY-MM-DD
  homeTeam:    text("home_team").notNull(),
  awayTeam:    text("away_team").notNull(),
  coachTeam:   text("coach_team").notNull(),       // which team the submitting coach represents

  // 5 vote entries — players can come from either team
  player1Number: text("player1_number"),
  player1Name:   text("player1_name"),
  player2Number: text("player2_number"),
  player2Name:   text("player2_name"),
  player3Number: text("player3_number"),
  player3Name:   text("player3_name"),
  player4Number: text("player4_number"),
  player4Name:   text("player4_name"),
  player5Number: text("player5_number"),
  player5Name:   text("player5_name"),

  submitterName:    text("submitter_name").notNull(),
  signatureDataUrl: text("signature_data_url"),   // initials text

  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type CoachesVoteInsert = typeof coachesVotes.$inferInsert;
export type CoachesVoteSelect = typeof coachesVotes.$inferSelect;

// ─── Team Access Codes ────────────────────────────────────────────────────────
// One row per team per grade. Codes survive team syncs (not wiped with teams table).
// Coaches enter this code to unlock the Coaches Vote form for their team.
export const teamAccessCodes = sqliteTable("team_access_codes", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  teamName:  text("team_name").notNull(),
  gradeName: text("grade_name").notNull(),
  code:      text("code").notNull().unique(),   // e.g. "GLEN-7X2K"
  active:    integer("active", { mode: "boolean" }).notNull().default(true),
});

export type TeamAccessCodeInsert = typeof teamAccessCodes.$inferInsert;
export type TeamAccessCodeSelect = typeof teamAccessCodes.$inferSelect;
