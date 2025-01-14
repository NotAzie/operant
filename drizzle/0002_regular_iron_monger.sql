ALTER TABLE `entities` MODIFY COLUMN `identityState` enum('resolved','unresolved') NOT NULL DEFAULT 'unresolved';--> statement-breakpoint
ALTER TABLE `evidence` MODIFY COLUMN `qualityState` enum('current','unknown','uncertain','incomplete','unavailable','unresolved','stale','conflicting') NOT NULL DEFAULT 'current';--> statement-breakpoint
ALTER TABLE `relationships` MODIFY COLUMN `epistemicState` enum('observed','inferred','unresolved','rejected') NOT NULL DEFAULT 'observed';--> statement-breakpoint
ALTER TABLE `actions` ADD `eventId` int;--> statement-breakpoint
ALTER TABLE `actions` ADD `dueAt` timestamp;--> statement-breakpoint
ALTER TABLE `evidence` ADD `sourceAuthority` enum('unknown','reported','direct','official') DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD `completedBy` int;--> statement-breakpoint
ALTER TABLE `observations` ADD `obligationId` int;--> statement-breakpoint
ALTER TABLE `operational_events` ADD `expectedAt` timestamp;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_eventId_operational_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `operational_events`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_completedBy_users_id_fk` FOREIGN KEY (`completedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_obligationId_obligations_id_fk` FOREIGN KEY (`obligationId`) REFERENCES `obligations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `observation_workspace_obligation_idx` ON `observations` (`workspaceId`,`obligationId`);