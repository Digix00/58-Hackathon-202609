CREATE TABLE `learning_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`concern_id` text,
	`cluster_id` text,
	`quiz_id` text,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cluster_id`) REFERENCES `concern_clusters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "learning_events_event_type_check" CHECK(event_type in ('view', 'reaction', 'quiz_answer'))
);
--> statement-breakpoint
CREATE INDEX `learning_events_user_idx` ON `learning_events` (`user_id`,"occurred_at" DESC);--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` text;