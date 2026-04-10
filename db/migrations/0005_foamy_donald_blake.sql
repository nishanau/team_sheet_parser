ALTER TABLE `teams` ADD `playhq_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `teams_playhq_id_unique` ON `teams` (`playhq_id`);