CREATE TABLE `concern_reactions` (
	`concern_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction_type` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`concern_id`, `user_id`, `reaction_type`),
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "concern_reactions_type_check" CHECK(reaction_type in ('empathy'))
);
--> statement-breakpoint
CREATE INDEX `reactions_user_idx` ON `concern_reactions` (`user_id`,`created_at`);