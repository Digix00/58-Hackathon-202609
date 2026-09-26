CREATE TABLE `reaction_digest_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`window_start` text,
	`window_end` text NOT NULL,
	`reactor_count` integer NOT NULL,
	`same_region_count` integer NOT NULL,
	`region_count` integer NOT NULL,
	`region_code_snapshot` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`line_retry_key` text,
	`http_status` integer,
	`line_request_id` text,
	`created_at` text NOT NULL,
	`attempted_at` text,
	`sent_at` text,
	`error_code` text,
	FOREIGN KEY (`run_id`) REFERENCES `reaction_digest_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reaction_digest_deliveries_status_check" CHECK("reaction_digest_deliveries"."status" in ('pending', 'started', 'sent', 'failed', 'skipped')),
	CONSTRAINT "reaction_digest_deliveries_retry_key_check" CHECK("reaction_digest_deliveries"."status" = 'pending' or "reaction_digest_deliveries"."status" = 'skipped' or "reaction_digest_deliveries"."line_retry_key" is not null),
	CONSTRAINT "reaction_digest_deliveries_count_check" CHECK("reaction_digest_deliveries"."reactor_count" > 0 and "reaction_digest_deliveries"."same_region_count" between 0 and "reaction_digest_deliveries"."reactor_count" and "reaction_digest_deliveries"."region_count" between 0 and "reaction_digest_deliveries"."reactor_count")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reaction_digest_deliveries_run_user_idx` ON `reaction_digest_deliveries` (`run_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reaction_digest_deliveries_retry_key_idx` ON `reaction_digest_deliveries` (`line_retry_key`);--> statement-breakpoint
CREATE INDEX `reaction_digest_deliveries_user_status_window_idx` ON `reaction_digest_deliveries` (`user_id`,`status`,`window_end`);--> statement-breakpoint
CREATE INDEX `reaction_digest_deliveries_run_status_idx` ON `reaction_digest_deliveries` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `reaction_digest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`cutoff_at` text NOT NULL,
	`claim_token` text,
	`lease_expires_at` text,
	`deliveries_prepared_at` text,
	`requested_at` text NOT NULL,
	`finished_at` text,
	CONSTRAINT "reaction_digest_runs_trigger_check" CHECK("reaction_digest_runs"."trigger" in ('cron', 'manual')),
	CONSTRAINT "reaction_digest_runs_status_check" CHECK("reaction_digest_runs"."status" in ('pending', 'running', 'succeeded', 'partially_failed', 'failed')),
	CONSTRAINT "reaction_digest_runs_lease_check" CHECK(("reaction_digest_runs"."status" = 'running' and "reaction_digest_runs"."claim_token" is not null and "reaction_digest_runs"."lease_expires_at" is not null) or ("reaction_digest_runs"."status" <> 'running' and "reaction_digest_runs"."claim_token" is null and "reaction_digest_runs"."lease_expires_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reaction_digest_runs_idempotency_idx` ON `reaction_digest_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `reaction_digest_runs_status_requested_idx` ON `reaction_digest_runs` (`status`,`requested_at`);