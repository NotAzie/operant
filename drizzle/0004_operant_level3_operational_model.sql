CREATE TABLE `action_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actionId` int NOT NULL,
	`provider` enum('github') NOT NULL,
	`operation` varchar(80) NOT NULL,
	`idempotencyKey` varchar(120) NOT NULL,
	`status` enum('prepared','submitting','provider_accepted','verified','failed','unknown') NOT NULL DEFAULT 'prepared',
	`requestPreview` text NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`authorizedRequestHash` varchar(64),
	`providerContext` json,
	`providerRequestId` varchar(160),
	`providerObjectId` varchar(160),
	`providerResponseMetadata` json,
	`attemptCount` int NOT NULL DEFAULT 0,
	`errorClass` varchar(80),
	`errorMessage` varchar(500),
	`verificationEvidenceId` int,
	`submittedAt` timestamp,
	`verifiedAt` timestamp,
	`completedAt` timestamp,
	`initiatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `action_attempt_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `action_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actionId` int NOT NULL,
	`actorId` int NOT NULL,
	`actorRole` enum('owner','admin','editor','viewer') NOT NULL,
	`scopeSnapshot` json NOT NULL,
	`riskLevel` enum('low','moderate','high','critical') NOT NULL,
	`requiredRole` enum('owner','admin','editor') NOT NULL,
	`approvalRequired` boolean NOT NULL DEFAULT true,
	`policySnapshot` json NOT NULL,
	`rationale` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `action_evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysis_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`eventId` int NOT NULL,
	`status` enum('queued','completed','failed','dismissed') NOT NULL DEFAULT 'queued',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`completedBy` int,
	CONSTRAINT `analysis_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysis_job_event_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `conflict_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`conflictKey` varchar(64) NOT NULL,
	`entityId` int,
	`attributeKey` varchar(120) NOT NULL,
	`observationIds` json NOT NULL,
	`status` enum('active','resolved') NOT NULL DEFAULT 'active',
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedBy` int,
	`resolution` text,
	CONSTRAINT `conflict_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `conflict_workspace_key_unique` UNIQUE(`workspaceId`,`conflictKey`)
);
--> statement-breakpoint
CREATE TABLE `event_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`eventId` int NOT NULL,
	`attemptNumber` int NOT NULL,
	`outcome` enum('started','succeeded','retry_scheduled','dead_letter','ignored') NOT NULL,
	`startedAt` timestamp NOT NULL,
	`finishedAt` timestamp,
	`errorClass` varchar(80),
	`errorMessage` varchar(500),
	CONSTRAINT `event_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_attempt_number_unique` UNIQUE(`eventId`,`attemptNumber`)
);
--> statement-breakpoint
CREATE TABLE `external_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`connectionId` int,
	`provider` enum('github') NOT NULL,
	`externalKind` enum('repository','issue','user') NOT NULL,
	`externalId` varchar(255) NOT NULL,
	`externalUrl` varchar(500),
	`entityId` int,
	`identityState` enum('resolved','unresolved') NOT NULL DEFAULT 'unresolved',
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_identity_scope_unique` UNIQUE(`workspaceId`,`provider`,`externalKind`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `github_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`provider` enum('github') NOT NULL DEFAULT 'github',
	`repositoryId` varchar(64) NOT NULL,
	`repositoryOwner` varchar(100) NOT NULL,
	`repositoryName` varchar(100) NOT NULL,
	`repositoryUrl` varchar(500) NOT NULL,
	`encryptedAccessToken` text,
	`encryptedWebhookSecret` text,
	`status` enum('active','reauthorization_required','disconnected','error') NOT NULL DEFAULT 'active',
	`lastValidatedAt` timestamp,
	`lastWebhookAt` timestamp,
	`lastErrorCode` varchar(80),
	`lastErrorAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `github_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `github_connection_workspace_repo_unique` UNIQUE(`workspaceId`,`repositoryId`)
);
--> statement-breakpoint
CREATE TABLE `inbound_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`connectionId` int,
	`provider` enum('github','manual') NOT NULL,
	`deliveryId` varchar(120) NOT NULL,
	`idempotencyKey` varchar(180) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`eventAction` varchar(100) NOT NULL,
	`sourceExternalId` varchar(240) NOT NULL,
	`correlationId` varchar(64) NOT NULL,
	`payloadHash` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`resultPayload` json,
	`actorId` int,
	`happenedAt` timestamp,
	`observedAt` timestamp NOT NULL,
	`status` enum('queued','processing','processed','retryable_failure','dead_letter','ignored') NOT NULL DEFAULT 'queued',
	`attemptCount` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`nextAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`leaseOwner` varchar(100),
	`leaseExpiresAt` timestamp,
	`processedAt` timestamp,
	`deadLetteredAt` timestamp,
	`lastErrorClass` varchar(80),
	`lastErrorMessage` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `inbound_event_delivery_unique` UNIQUE(`connectionId`,`deliveryId`),
	CONSTRAINT `inbound_event_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bucketKey` varchar(64) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`hitCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limit_buckets_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limit_buckets_bucketKey_unique` UNIQUE(`bucketKey`)
);
--> statement-breakpoint
CREATE TABLE `reasoning_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`trigger` enum('manual','event') NOT NULL DEFAULT 'manual',
	`status` enum('running','completed','failed','unavailable') NOT NULL DEFAULT 'running',
	`modelId` varchar(160) NOT NULL,
	`contextHash` varchar(64) NOT NULL,
	`contextSnapshot` json NOT NULL,
	`evidenceIds` json NOT NULL,
	`objectiveSnapshot` json NOT NULL,
	`policySnapshot` json NOT NULL,
	`rulesSnapshot` json NOT NULL,
	`promptVersion` varchar(40) NOT NULL,
	`output` json,
	`errorClass` varchar(80),
	`errorMessage` varchar(500),
	`promptTokens` int,
	`completionTokens` int,
	`createdBy` int,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `reasoning_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resource_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`resourceId` int NOT NULL,
	`obligationId` int,
	`amount` decimal(14,3) NOT NULL,
	`unit` varchar(40) NOT NULL,
	`status` enum('planned','active','released','unknown') NOT NULL DEFAULT 'planned',
	`validFrom` timestamp NOT NULL,
	`validTo` timestamp,
	`evidenceId` int,
	`createdBy` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resource_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resource_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`resourceId` int NOT NULL,
	`capacity` decimal(14,3),
	`unit` varchar(40),
	`availabilityState` enum('available','limited','unavailable','unknown') NOT NULL DEFAULT 'unknown',
	`validFrom` timestamp NOT NULL,
	`validTo` timestamp,
	`evidenceId` int,
	`supersedesVersionId` int,
	`createdBy` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resource_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`resourceType` varchar(80) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `responsibility_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`responsibleUserId` int,
	`responsibleEntityId` int,
	`subjectEntityId` int,
	`responsibilityType` varchar(100) NOT NULL,
	`status` enum('active','delegated','ended','unknown') NOT NULL DEFAULT 'active',
	`validFrom` timestamp NOT NULL,
	`validTo` timestamp,
	`evidenceId` int,
	`supersedesAssignmentId` int,
	`createdBy` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `responsibility_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`taskUid` varchar(120) NOT NULL,
	`cronExpression` varchar(80) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`lastError` varchar(500),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `worker_schedule_task_uid_unique` UNIQUE(`taskUid`)
);
--> statement-breakpoint
ALTER TABLE `actions` MODIFY COLUMN `actionType` enum('internal_follow_up','github_issue_comment') NOT NULL DEFAULT 'internal_follow_up';--> statement-breakpoint
ALTER TABLE `evidence` ADD `sourceEventId` int;--> statement-breakpoint
ALTER TABLE `observations` ADD `sourceEventId` int;--> statement-breakpoint
ALTER TABLE `operational_events` ADD `sourceProvider` enum('github');--> statement-breakpoint
ALTER TABLE `operational_events` ADD `sourceExternalId` varchar(240);--> statement-breakpoint
ALTER TABLE `operational_events` ADD `correlationId` varchar(64);--> statement-breakpoint
ALTER TABLE `operational_events` ADD `causationId` varchar(64);--> statement-breakpoint
ALTER TABLE `action_attempts` ADD CONSTRAINT `action_attempts_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_attempts` ADD CONSTRAINT `action_attempts_actionId_actions_id_fk` FOREIGN KEY (`actionId`) REFERENCES `actions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_attempts` ADD CONSTRAINT `action_attempts_verificationEvidenceId_evidence_id_fk` FOREIGN KEY (`verificationEvidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_attempts` ADD CONSTRAINT `action_attempts_initiatedBy_users_id_fk` FOREIGN KEY (`initiatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_evaluations` ADD CONSTRAINT `action_evaluations_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_evaluations` ADD CONSTRAINT `action_evaluations_actionId_actions_id_fk` FOREIGN KEY (`actionId`) REFERENCES `actions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_evaluations` ADD CONSTRAINT `action_evaluations_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD CONSTRAINT `analysis_jobs_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD CONSTRAINT `analysis_jobs_eventId_inbound_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `inbound_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD CONSTRAINT `analysis_jobs_completedBy_users_id_fk` FOREIGN KEY (`completedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conflict_records` ADD CONSTRAINT `conflict_records_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conflict_records` ADD CONSTRAINT `conflict_records_entityId_entities_id_fk` FOREIGN KEY (`entityId`) REFERENCES `entities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conflict_records` ADD CONSTRAINT `conflict_records_resolvedBy_users_id_fk` FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_attempts` ADD CONSTRAINT `event_attempts_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_attempts` ADD CONSTRAINT `event_attempts_eventId_inbound_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `inbound_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_identities` ADD CONSTRAINT `external_identities_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_identities` ADD CONSTRAINT `external_identities_connectionId_github_connections_id_fk` FOREIGN KEY (`connectionId`) REFERENCES `github_connections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_identities` ADD CONSTRAINT `external_identities_entityId_entities_id_fk` FOREIGN KEY (`entityId`) REFERENCES `entities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `github_connections` ADD CONSTRAINT `github_connections_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `github_connections` ADD CONSTRAINT `github_connections_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD CONSTRAINT `inbound_events_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD CONSTRAINT `inbound_events_connectionId_github_connections_id_fk` FOREIGN KEY (`connectionId`) REFERENCES `github_connections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD CONSTRAINT `inbound_events_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reasoning_runs` ADD CONSTRAINT `reasoning_runs_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reasoning_runs` ADD CONSTRAINT `reasoning_runs_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocations_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocations_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocations_obligationId_obligations_id_fk` FOREIGN KEY (`obligationId`) REFERENCES `obligations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocations_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_versions_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_versions_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_versions_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_versions_supersedesVersionId_resource_versions_id_fk` FOREIGN KEY (`supersedesVersionId`) REFERENCES `resource_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_versions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resources_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resources_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_assignments_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_assignments_responsibleUserId_users_id_fk` FOREIGN KEY (`responsibleUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_assignments_responsibleEntityId_entities_id_fk` FOREIGN KEY (`responsibleEntityId`) REFERENCES `entities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_assignments_subjectEntityId_entities_id_fk` FOREIGN KEY (`subjectEntityId`) REFERENCES `entities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_assignments_evidenceId_evidence_id_fk` FOREIGN KEY (`evidenceId`) REFERENCES `evidence`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_supersedes_assignment_fk` FOREIGN KEY (`supersedesAssignmentId`) REFERENCES `responsibility_assignments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_assignments_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_schedules` ADD CONSTRAINT `worker_schedules_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `action_attempt_workspace_status_idx` ON `action_attempts` (`workspaceId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `action_attempt_action_idx` ON `action_attempts` (`workspaceId`,`actionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `action_evaluation_workspace_idx` ON `action_evaluations` (`workspaceId`,`actionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `analysis_job_workspace_status_idx` ON `analysis_jobs` (`workspaceId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `conflict_workspace_status_idx` ON `conflict_records` (`workspaceId`,`status`,`detectedAt`);--> statement-breakpoint
CREATE INDEX `event_attempt_workspace_time_idx` ON `event_attempts` (`workspaceId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `external_identity_entity_idx` ON `external_identities` (`workspaceId`,`entityId`);--> statement-breakpoint
CREATE INDEX `github_connection_workspace_status_idx` ON `github_connections` (`workspaceId`,`status`);--> statement-breakpoint
CREATE INDEX `inbound_event_due_idx` ON `inbound_events` (`status`,`nextAttemptAt`,`leaseExpiresAt`);--> statement-breakpoint
CREATE INDEX `inbound_event_workspace_time_idx` ON `inbound_events` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reasoning_workspace_time_idx` ON `reasoning_runs` (`workspaceId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `resource_allocation_workspace_time_idx` ON `resource_allocations` (`workspaceId`,`resourceId`,`validFrom`);--> statement-breakpoint
CREATE INDEX `resource_version_workspace_time_idx` ON `resource_versions` (`workspaceId`,`resourceId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `resource_workspace_type_idx` ON `resources` (`workspaceId`,`resourceType`);--> statement-breakpoint
CREATE INDEX `responsibility_workspace_time_idx` ON `responsibility_assignments` (`workspaceId`,`responsibilityType`,`recordedAt`);--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_sourceEventId_inbound_events_id_fk` FOREIGN KEY (`sourceEventId`) REFERENCES `inbound_events`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_sourceEventId_inbound_events_id_fk` FOREIGN KEY (`sourceEventId`) REFERENCES `inbound_events`(`id`) ON DELETE set null ON UPDATE no action;
