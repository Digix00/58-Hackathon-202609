CREATE TABLE `concern_views` (
	`concern_id` text NOT NULL,
	`actor_key` text NOT NULL,
	`viewed_at` text NOT NULL,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_key`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concern_views_concern_actor_idx` ON `concern_views` (`concern_id`,`actor_key`);--> statement-breakpoint
CREATE INDEX `concern_views_actor_viewed_at_idx` ON `concern_views` (`actor_key`,`viewed_at`);