PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_concerns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`age_group` text,
	`gender_code` text,
	`region_code` text,
	`visibility_status` text DEFAULT 'published' NOT NULL,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "concerns_age_group_check" CHECK("__new_concerns"."age_group" is null or "__new_concerns"."age_group" in ('10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s_plus', 'no_answer')),
	CONSTRAINT "concerns_gender_code_check" CHECK("__new_concerns"."gender_code" is null or "__new_concerns"."gender_code" in ('male', 'female', 'non_binary', 'other', 'no_answer')),
	CONSTRAINT "concerns_visibility_status_check" CHECK("__new_concerns"."visibility_status" in ('published', 'hidden', 'deleted')),
	CONSTRAINT "concerns_processing_status_check" CHECK("__new_concerns"."processing_status" in ('pending', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_concerns`("id", "user_id", "body", "age_group", "gender_code", "region_code", "visibility_status", "processing_status", "created_at", "updated_at") SELECT "id", "user_id", "body", "age_group", "gender_code", "region_code", CASE WHEN "visibility_status" = 'pending' THEN 'published' ELSE "visibility_status" END, "processing_status", "created_at", "updated_at" FROM `concerns`;--> statement-breakpoint
DROP TABLE `concerns`;--> statement-breakpoint
ALTER TABLE `__new_concerns` RENAME TO `concerns`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `concerns_feed_idx` ON `concerns` (`visibility_status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `concerns_region_feed_idx` ON `concerns` (`region_code`,`visibility_status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `concerns_user_idx` ON `concerns` (`user_id`,`created_at`);