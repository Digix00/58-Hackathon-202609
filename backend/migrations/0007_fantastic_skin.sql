CREATE TABLE `quiz_answers` (
	`attempt_id` text NOT NULL,
	`quiz_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`selected_concern_id` text NOT NULL,
	`is_correct` integer NOT NULL,
	PRIMARY KEY(`attempt_id`, `participant_id`),
	FOREIGN KEY (`attempt_id`,`quiz_id`) REFERENCES `quiz_attempts`(`id`,`quiz_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`,`quiz_id`) REFERENCES `quiz_participants`(`id`,`quiz_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`,`selected_concern_id`) REFERENCES `quiz_options`(`quiz_id`,`concern_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_answers_is_correct_check" CHECK("quiz_answers"."is_correct" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`user_id` text NOT NULL,
	`score` integer NOT NULL,
	`answered_at` text NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_attempts_score_check" CHECK("quiz_attempts"."score" between 0 and 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_quiz_user_idx` ON `quiz_attempts` (`quiz_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_id_quiz_idx` ON `quiz_attempts` (`id`,`quiz_id`);--> statement-breakpoint
CREATE TABLE `quiz_options` (
	`quiz_id` text NOT NULL,
	`concern_id` text NOT NULL,
	`display_order` integer NOT NULL,
	PRIMARY KEY(`quiz_id`, `concern_id`),
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_options_display_order_check" CHECK("quiz_options"."display_order" between 1 and 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_options_quiz_order_idx` ON `quiz_options` (`quiz_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `quiz_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`user_id` text NOT NULL,
	`concern_id` text NOT NULL,
	`display_order` integer NOT NULL,
	`age_group_snapshot` text,
	`gender_snapshot` text,
	`region_code_snapshot` text,
	`explanation` text NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_participants_display_order_check" CHECK("quiz_participants"."display_order" between 1 and 3),
	CONSTRAINT "quiz_participants_age_group_check" CHECK("quiz_participants"."age_group_snapshot" is null or "quiz_participants"."age_group_snapshot" in ('10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s_plus', 'no_answer')),
	CONSTRAINT "quiz_participants_gender_check" CHECK("quiz_participants"."gender_snapshot" is null or "quiz_participants"."gender_snapshot" in ('male', 'female', 'non_binary', 'other', 'no_answer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_participants_quiz_user_idx` ON `quiz_participants` (`quiz_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_participants_quiz_concern_idx` ON `quiz_participants` (`quiz_id`,`concern_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_participants_quiz_id_idx` ON `quiz_participants` (`id`,`quiz_id`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text,
	`hidden_at` text,
	CONSTRAINT "quizzes_status_check" CHECK("quizzes"."status" in ('draft', 'published', 'closed', 'hidden'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quizzes_quiz_date_idx` ON `quizzes` (`quiz_date`);--> statement-breakpoint
CREATE INDEX `quizzes_status_date_idx` ON `quizzes` (`status`,`quiz_date`);