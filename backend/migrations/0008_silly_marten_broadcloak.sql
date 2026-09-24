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
