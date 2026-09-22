CREATE TABLE `concerns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`input_method` text NOT NULL,
	`age_group` text,
	`gender_code` text,
	`region_code` text,
	`visibility_status` text DEFAULT 'published' NOT NULL,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "concerns_input_method_check" CHECK("concerns"."input_method" in ('liff', 'voice')),
	CONSTRAINT "concerns_age_group_check" CHECK("concerns"."age_group" is null or "concerns"."age_group" in ('10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s_plus', 'no_answer')),
	CONSTRAINT "concerns_gender_code_check" CHECK("concerns"."gender_code" is null or "concerns"."gender_code" in ('male', 'female', 'non_binary', 'other', 'no_answer')),
	CONSTRAINT "concerns_visibility_status_check" CHECK("concerns"."visibility_status" in ('pending', 'published', 'hidden', 'deleted')),
	CONSTRAINT "concerns_processing_status_check" CHECK("concerns"."processing_status" in ('pending', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `concerns_feed_idx` ON `concerns` (`visibility_status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `concerns_region_feed_idx` ON `concerns` (`region_code`,`visibility_status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `concerns_user_idx` ON `concerns` (`user_id`,`created_at`);
