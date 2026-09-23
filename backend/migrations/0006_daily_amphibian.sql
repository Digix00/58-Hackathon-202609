CREATE TABLE `concern_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`model_version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `concern_clusters_status_idx` ON `concern_clusters` (`status`);--> statement-breakpoint
CREATE TABLE `concern_views` (
	`concern_id` text NOT NULL,
	`actor_key` text NOT NULL,
	`viewed_at` text NOT NULL,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_key`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concern_views_concern_actor_idx` ON `concern_views` (`concern_id`,`actor_key`);--> statement-breakpoint
CREATE INDEX `concern_views_actor_viewed_at_idx` ON `concern_views` (`actor_key`,`viewed_at`);--> statement-breakpoint
CREATE TABLE `feed_impressions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`concern_id` text NOT NULL,
	`strategy` text NOT NULL,
	`reason_code` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`position` integer NOT NULL,
	`exposed_at` text NOT NULL,
	`opened_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feed_impressions_user_idx` ON `feed_impressions` (`user_id`,`exposed_at`);--> statement-breakpoint
ALTER TABLE `concerns` ADD `cluster_id` text REFERENCES concern_clusters(id);--> statement-breakpoint
CREATE INDEX `concerns_cluster_feed_idx` ON `concerns` (`cluster_id`,`visibility_status`,`created_at`,`id`);