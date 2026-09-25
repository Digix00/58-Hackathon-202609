ALTER TABLE `users` ADD COLUMN `display_language` text DEFAULT 'original' NOT NULL CHECK (`display_language` in ('original', 'jaHira', 'en'));
