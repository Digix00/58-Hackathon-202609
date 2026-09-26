CREATE TABLE `speech_transcription_rate_limit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `speech_transcription_rate_limit_user_created_idx` ON `speech_transcription_rate_limit_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `speech_transcription_rate_limit_created_idx` ON `speech_transcription_rate_limit_events` (`created_at`);