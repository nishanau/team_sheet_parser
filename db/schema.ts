import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
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

// ─── Teams ────────────────────────────────────────────────────────────────────
// A team belongs to a league. ageGroup scopes which division they play in.
export const teams = sqliteTable("teams", {
  id:       integer("id").primaryKey({ autoIncrement: true }),
  leagueId: integer("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  name:     text("name").notNull(),
  ageGroup: text("age_group"),   // null = competes in all divisions (senior clubs etc.)
});

export const teamsRelations = relations(teams, ({ one, many }) => ({
  league:  one(leagues, { fields: [teams.leagueId], references: [leagues.id] }),
  players: many(players),
}));

export type TeamInsert = typeof teams.$inferInsert;
export type TeamSelect = typeof teams.$inferSelect;

// ─── Players ──────────────────────────────────────────────────────────────────
export const players = sqliteTable("players", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  teamId:       integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  jumperNumber: text("jumper_number"),
  firstName:    text("first_name").notNull(),
  lastName:     text("last_name").notNull(),
});

export const playersRelations = relations(players, ({ one }) => ({
  team: one(teams, { fields: [players.teamId], references: [teams.id] }),
}));

export type PlayerInsert = typeof players.$inferInsert;
export type PlayerSelect = typeof players.$inferSelect;

// ─── Best & Fairest Votes ─────────────────────────────────────────────────────
export const bestAndFairest = sqliteTable("best_and_fairest", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  competition: text("competition").notNull(),           // "SFL" | "STJFL"
  matchDate:   text("match_date").notNull(),            // YYYY-MM-DD (Tasmania time)
  ageGroup:    text("age_group").notNull(),
  opposition:  text("opposition").notNull(),

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
  signatureDataUrl: text("signature_data_url"),         // base64 PNG from canvas

  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type BestAndFairestInsert = typeof bestAndFairest.$inferInsert;
export type BestAndFairestSelect = typeof bestAndFairest.$inferSelect;
