PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_concern_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`summary` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`model_version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_concern_clusters`("id", "label", "summary", "status", "model_version", "created_at", "updated_at") SELECT "id", "label", "summary", "status", "model_version", "created_at", "updated_at" FROM `concern_clusters`;--> statement-breakpoint
DROP TABLE `concern_clusters`;--> statement-breakpoint
ALTER TABLE `__new_concern_clusters` RENAME TO `concern_clusters`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `concern_clusters_status_idx` ON `concern_clusters` (`status`);