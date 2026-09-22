PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`line_user_id` text NOT NULL,
	`birth_year` integer,
	`gender_code` text,
	`region_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_birth_year_check" CHECK("__new_users"."birth_year" is null or "__new_users"."birth_year" between 1900 and 2100),
	CONSTRAINT "users_gender_code_check" CHECK("__new_users"."gender_code" is null or "__new_users"."gender_code" in ('male', 'female', 'non_binary', 'other', 'no_answer')),
	CONSTRAINT "users_region_code_check" CHECK("__new_users"."region_code" is null or "__new_users"."region_code" in ('hokkaido', 'aomori', 'iwate', 'miyagi', 'akita', 'yamagata', 'fukushima', 'ibaraki', 'tochigi', 'gunma', 'saitama', 'chiba', 'tokyo', 'kanagawa', 'niigata', 'toyama', 'ishikawa', 'fukui', 'yamanashi', 'nagano', 'gifu', 'shizuoka', 'aichi', 'mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara', 'wakayama', 'tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi', 'tokushima', 'kagawa', 'ehime', 'kochi', 'fukuoka', 'saga', 'nagasaki', 'kumamoto', 'oita', 'miyazaki', 'kagoshima', 'okinawa'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "line_user_id", "birth_year", "gender_code", "region_code", "created_at", "updated_at") SELECT "id", "line_user_id", "birth_year", "gender_code", "region_code", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_line_user_id_idx` ON `users` (`line_user_id`);