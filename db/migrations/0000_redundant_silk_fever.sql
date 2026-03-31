CREATE TABLE `best_and_fairest` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition` text NOT NULL,
	`match_date` text NOT NULL,
	`age_group` text NOT NULL,
	`opposition` text NOT NULL,
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
CREATE TABLE `leagues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leagues_name_unique` ON `leagues` (`name`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`jumper_number` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league_id` integer NOT NULL,
	`name` text NOT NULL,
	`age_group` text,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
