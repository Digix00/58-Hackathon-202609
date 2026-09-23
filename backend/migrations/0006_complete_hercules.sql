CREATE TABLE `concern_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`summary` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`model_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "concern_clusters_status_check" CHECK("concern_clusters"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `concern_representations` (
	`concern_id` text NOT NULL,
	`locale` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`error_code` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`concern_id`, `locale`),
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "concern_representations_locale_check" CHECK("concern_representations"."locale" in ('ja-Hira', 'en')),
	CONSTRAINT "concern_representations_status_check" CHECK("concern_representations"."status" in ('ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE `concerns` ADD `cluster_id` text REFERENCES concern_clusters(id);--> statement-breakpoint
CREATE INDEX `concerns_cluster_feed_idx` ON `concerns` (`cluster_id`,`visibility_status`,`created_at`,`id`);