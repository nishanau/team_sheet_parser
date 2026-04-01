CREATE TABLE `coaches_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grade` text NOT NULL,
	`round` text NOT NULL,
	`match_date` text NOT NULL,
	`home_team` text NOT NULL,
	`away_team` text NOT NULL,
	`coach_team` text NOT NULL,
	`player1_number` text,
	`player1_name` text,
	`player2_number` text,
	`player2_name` text,
	`player3_number` text,
	`player3_name` text,
	`player4_number` text,
	`player4_name` text,
	`player5_number` text,
	`player5_name` text,
	`submitter_name` text NOT NULL,
	`signature_data_url` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`grade_name` text NOT NULL,
	`round_name` text NOT NULL,
	`match_date` text NOT NULL,
	`home_team_name` text NOT NULL,
	`away_team_name` text NOT NULL,
	`venue_name` text
);
--> statement-breakpoint
CREATE INDEX `fixtures_grade_home_round_idx` ON `fixtures` (`grade_name`,`home_team_name`,`round_name`);--> statement-breakpoint
CREATE INDEX `fixtures_grade_away_idx` ON `fixtures` (`grade_name`,`away_team_name`);--> statement-breakpoint
CREATE TABLE `game_players_fetched` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`team_name` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gpf_game_team_idx` ON `game_players_fetched` (`game_id`,`team_name`);--> statement-breakpoint
CREATE TABLE `team_access_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_name` text NOT NULL,
	`grade_name` text NOT NULL,
	`code` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_access_codes_code_unique` ON `team_access_codes` (`code`);--> statement-breakpoint
CREATE TABLE `team_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_name` text NOT NULL,
	`player_number` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`profile_id` text,
	`last_seen_game_id` text
);
--> statement-breakpoint
CREATE INDEX `team_players_team_name_idx` ON `team_players` (`team_name`);--> statement-breakpoint
CREATE INDEX `team_players_team_profile_idx` ON `team_players` (`team_name`,`profile_id`);--> statement-breakpoint
CREATE INDEX `team_players_team_firstname_lastname_idx` ON `team_players` (`team_name`,`first_name`,`last_name`);--> statement-breakpoint
DROP TABLE `players`;--> statement-breakpoint
ALTER TABLE `best_and_fairest` ADD `grade` text;--> statement-breakpoint
ALTER TABLE `best_and_fairest` ADD `home_team` text;--> statement-breakpoint
ALTER TABLE `best_and_fairest` ADD `round` text NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `grade_name` text;--> statement-breakpoint
ALTER TABLE `teams` DROP COLUMN `age_group`;