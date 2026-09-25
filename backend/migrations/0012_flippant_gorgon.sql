CREATE TABLE `line_broadcast_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`broadcast_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`line_request_id` text,
	`line_accepted_request_id` text,
	`line_retry_key` text NOT NULL,
	`attempted_at` text NOT NULL,
	`error_message` text,
	FOREIGN KEY (`broadcast_id`) REFERENCES `line_broadcasts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "line_broadcast_attempts_status_check" CHECK("line_broadcast_attempts"."status" in ('started', 'succeeded', 'failed')),
	CONSTRAINT "line_broadcast_attempts_number_check" CHECK("line_broadcast_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_broadcast_attempts_number_idx` ON `line_broadcast_attempts` (`broadcast_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `line_broadcast_attempts_retry_key_idx` ON `line_broadcast_attempts` (`line_retry_key`);--> statement-breakpoint
CREATE INDEX `line_broadcast_attempts_status_attempted_idx` ON `line_broadcast_attempts` (`status`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `line_broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`claim_token` text,
	`lease_expires_at` text,
	`requested_at` text NOT NULL,
	`sent_at` text,
	`finished_at` text,
	`last_error` text,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "line_broadcasts_status_check" CHECK("line_broadcasts"."status" in ('pending', 'running', 'succeeded', 'failed')),
	CONSTRAINT "line_broadcasts_lease_check" CHECK(("line_broadcasts"."status" = 'running' and "line_broadcasts"."claim_token" is not null and "line_broadcasts"."lease_expires_at" is not null) or ("line_broadcasts"."status" <> 'running' and "line_broadcasts"."claim_token" is null and "line_broadcasts"."lease_expires_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_broadcasts_quiz_idx` ON `line_broadcasts` (`quiz_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `line_broadcasts_idempotency_idx` ON `line_broadcasts` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `line_broadcasts_status_requested_idx` ON `line_broadcasts` (`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `line_webhook_events` (
	`webhook_event_id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`received_at` text NOT NULL,
	`processed_at` text,
	`error_code` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "line_webhook_events_status_check" CHECK("line_webhook_events"."status" in ('received', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `line_webhook_events_user_received_idx` ON `line_webhook_events` (`user_id`,`received_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `friend_status` text;--> statement-breakpoint
ALTER TABLE `users` ADD `joined_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `unfollowed_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` text;