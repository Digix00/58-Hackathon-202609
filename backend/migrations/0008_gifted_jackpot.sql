PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_quiz_options` (
	`quiz_id` text NOT NULL,
	`concern_id` text NOT NULL,
	`display_order` integer NOT NULL,
	PRIMARY KEY(`quiz_id`, `concern_id`),
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`,`concern_id`) REFERENCES `quiz_participants`(`quiz_id`,`concern_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_options_display_order_check" CHECK("__new_quiz_options"."display_order" between 1 and 3)
);
--> statement-breakpoint
INSERT INTO `__new_quiz_options`("quiz_id", "concern_id", "display_order") SELECT "quiz_id", "concern_id", "display_order" FROM `quiz_options`;--> statement-breakpoint
DROP TABLE `quiz_options`;--> statement-breakpoint
ALTER TABLE `__new_quiz_options` RENAME TO `quiz_options`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_options_quiz_order_idx` ON `quiz_options` (`quiz_id`,`display_order`);