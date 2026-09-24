ALTER TABLE `concern_clusters` RENAME COLUMN `label` TO `legacy_label`;
--> statement-breakpoint
ALTER TABLE `concern_clusters` RENAME COLUMN `summary` TO `legacy_summary`;
--> statement-breakpoint
ALTER TABLE `concern_clusters` ADD COLUMN `label` text;
--> statement-breakpoint
ALTER TABLE `concern_clusters` ADD COLUMN `summary` text;
--> statement-breakpoint
UPDATE `concern_clusters`
SET `label` = `legacy_label`, `summary` = `legacy_summary`;
--> statement-breakpoint
ALTER TABLE `concerns` ADD `embedding_version` text;
