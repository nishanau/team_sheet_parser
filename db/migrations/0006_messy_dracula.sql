CREATE TABLE `vote_window_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition` text NOT NULL,
	`grade` text NOT NULL,
	`round` text NOT NULL,
	`fixture_id` text,
	`extended_until` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vwo_grade_round_idx` ON `vote_window_overrides` (`competition`,`grade`,`round`);--> statement-breakpoint
CREATE INDEX `vwo_fixture_idx` ON `vote_window_overrides` (`fixture_id`);