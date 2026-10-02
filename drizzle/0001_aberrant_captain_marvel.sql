CREATE TABLE `archive_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`section` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`object_key` text,
	`size` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_parent_name` ON `archive_entries` (`parent_id`,`name`);