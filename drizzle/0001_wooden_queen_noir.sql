CREATE TABLE `action_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actionId` int NOT NULL,
	`fromState` enum('proposed','authorized','submitted','accepted','executing','confirmed','failed','rejected','expired','unknown'),
	`toState` enum('proposed','authorized','submitted','accepted','executing','confirmed','failed','rejected','expired','unknown') NOT NULL,
	`actorId` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `action_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actionType` enum('internal_follow_up') NOT NULL DEFAULT 'internal_follow_up',
	`title` varchar(220) NOT NULL,
	`description` text,
	`obligationId` int,
	`evidenceId` int,
	`status` enum('proposed','authorized','submitted','accepted','executing','confirmed','failed','rejected','expired','unknown') NOT NULL DEFAULT 'proposed',
	`proposedBy` int NOT NULL,
	`authorizedBy` int,
	`outcome` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actorId` int,
	`operation` varchar(100) NOT NULL,
	`recordType` varchar(64) NOT NULL,
	`recordId` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`displayName` varchar(200) NOT NULL,
	`description` text,
	`sourceIdentity` varchar(220),
	`identityState` enum('resolved','unresolved') NOT NULL DEFAULT 'resolved',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`sourceName` varchar(200) NOT NULL,
	`sourceType` enum('manual','sample','integration') NOT NULL DEFAULT 'manual',
	`sourceRef` varchar(240),
	`claim` text NOT NULL,
	`observedAt` timestamp NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`validFrom` timestamp,
	`validTo` timestamp,
	`epistemicState` enum('observed','derived','inferred','predicted') NOT NULL DEFAULT 'observed',
	`qualityState` enum('current','uncertain','incomplete','unavailable','unresolved','stale','conflicting') NOT NULL DEFAULT 'current',
	`confidence` int NOT NULL DEFAULT 100,
	`supersedesEvidenceId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actionId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text,
	`dueAt` timestamp,
	`status` enum('open','completed') NOT NULL DEFAULT 'open',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `follow_ups_id` PRIMARY KEY(`id`),
	CONSTRAINT `follow_up_action_unique` UNIQUE(`actionId`)
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`priority` enum('required','preference') NOT NULL DEFAULT 'preference',
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `objectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `obligations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text,
	`ownerEntityId` int,
	`counterpartyEntityId` int,
	`dueAt` timestamp,
	`amount` decimal(12,2),
	`currency` varchar(3),
	`status` enum('open','satisfied','cancelled','disputed') NOT NULL DEFAULT 'open',
	`evidenceId` int,
	`completionEvidenceId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `obligations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`entityId` int,
	`evidenceId` int NOT NULL,
	`attributeKey` varchar(120) NOT NULL,
	`value` text NOT NULL,
	`epistemicState` enum('observed','derived','inferred','predicted') NOT NULL DEFAULT 'observed',
	`confidence` int NOT NULL DEFAULT 100,
	`observedAt` timestamp NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`validFrom` timestamp,
	`validTo` timestamp,
	`supersedesObservationId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operational_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`recordType` varchar(64) NOT NULL,
	`recordId` int,
	`summary` varchar(500) NOT NULL,
	`evidenceId` int,
	`happenedAt` timestamp,
	`observedAt` timestamp,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`epistemicState` enum('observed','derived','inferred','predicted','executed','confirmed') NOT NULL DEFAULT 'observed',
	`actorId` int,
	CONSTRAINT `operational_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`subjectEntityId` int NOT NULL,
	`predicate` varchar(100) NOT NULL,
	`objectEntityId` int NOT NULL,
	`evidenceId` int,
	`epistemicState` enum('observed','inferred','unresolved') NOT NULL DEFAULT 'observed',
	`confidence` int NOT NULL DEFAULT 100,
	`validFrom` timestamp NOT NULL DEFAULT (now()),
	`validTo` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relationships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','editor','viewer') NOT NULL DEFAULT 'editor',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_member_unique` UNIQUE(`workspaceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `workspace_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`key` enum('due_soon_days','stale_after_days') NOT NULL,
	`value` int NOT NULL,
	`updatedBy` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_policy_unique` UNIQUE(`workspaceId`,`key`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`kind` enum('personal','organization') NOT NULL DEFAULT 'personal',
	`isIllustrative` boolean NOT NULL DEFAULT false,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `action_events` ADD CONSTRAINT `action_events_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_events` ADD CONSTRAINT `action_events_actionId_actions_id_fk` FOREIGN KEY (`actionId`) REFERENCES `actions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_events` ADD CONSTRAINT `action_events_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_obligationId_obligations_id_fk` FOREIGN KEY (`obligationId`) REFERENCES `obligations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_proposedBy_users_id_fk` FOREIGN KEY (`proposedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_authorizedBy_users_id_fk` FOREIGN KEY (`authorizedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entities` ADD CONSTRAINT `entities_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entities` ADD CONSTRAINT `entities_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_supersedesEvidenceId_evidence_id_fk` FOREIGN KEY (`supersedesEvidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_actionId_actions_id_fk` FOREIGN KEY (`actionId`) REFERENCES `actions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `objectives` ADD CONSTRAINT `objectives_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `objectives` ADD CONSTRAINT `objectives_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligations_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligations_ownerEntityId_entities_id_fk` FOREIGN KEY (`ownerEntityId`) REFERENCES `entities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligations_counterpartyEntityId_entities_id_fk` FOREIGN KEY (`counterpartyEntityId`) REFERENCES `entities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligations_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligations_completionEvidenceId_evidence_id_fk` FOREIGN KEY (`completionEvidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_entityId_entities_id_fk` FOREIGN KEY (`entityId`) REFERENCES `entities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_supersedesObservationId_observations_id_fk` FOREIGN KEY (`supersedesObservationId`) REFERENCES `observations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_events` ADD CONSTRAINT `operational_events_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_events` ADD CONSTRAINT `operational_events_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_events` ADD CONSTRAINT `operational_events_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_subjectEntityId_entities_id_fk` FOREIGN KEY (`subjectEntityId`) REFERENCES `entities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_objectEntityId_entities_id_fk` FOREIGN KEY (`objectEntityId`) REFERENCES `entities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_policies` ADD CONSTRAINT `workspace_policies_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_policies` ADD CONSTRAINT `workspace_policies_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `action_event_workspace_time_idx` ON `action_events` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `action_workspace_status_idx` ON `actions` (`workspaceId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_workspace_time_idx` ON `audit_log` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `entity_workspace_name_idx` ON `entities` (`workspaceId`,`displayName`);--> statement-breakpoint
CREATE INDEX `evidence_workspace_observed_idx` ON `evidence` (`workspaceId`,`observedAt`);--> statement-breakpoint
CREATE INDEX `evidence_workspace_source_idx` ON `evidence` (`workspaceId`,`sourceName`);--> statement-breakpoint
CREATE INDEX `follow_up_workspace_status_idx` ON `follow_ups` (`workspaceId`,`status`,`dueAt`);--> statement-breakpoint
CREATE INDEX `workspace_objective_idx` ON `objectives` (`workspaceId`,`active`);--> statement-breakpoint
CREATE INDEX `obligation_workspace_due_idx` ON `obligations` (`workspaceId`,`status`,`dueAt`);--> statement-breakpoint
CREATE INDEX `observation_workspace_entity_idx` ON `observations` (`workspaceId`,`entityId`);--> statement-breakpoint
CREATE INDEX `observation_workspace_key_idx` ON `observations` (`workspaceId`,`attributeKey`);--> statement-breakpoint
CREATE INDEX `operational_event_workspace_time_idx` ON `operational_events` (`workspaceId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `relationship_workspace_subject_idx` ON `relationships` (`workspaceId`,`subjectEntityId`);--> statement-breakpoint
CREATE INDEX `relationship_workspace_object_idx` ON `relationships` (`workspaceId`,`objectEntityId`);--> statement-breakpoint
CREATE INDEX `workspace_member_user_idx` ON `workspace_members` (`userId`);--> statement-breakpoint
CREATE INDEX `workspace_created_by_idx` ON `workspaces` (`createdBy`);