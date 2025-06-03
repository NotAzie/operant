ALTER TABLE `action_attempts` DROP FOREIGN KEY `action_attempts_actionId_actions_id_fk`;
--> statement-breakpoint
ALTER TABLE `action_attempts` DROP FOREIGN KEY `action_attempts_verificationEvidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `action_evaluations` DROP FOREIGN KEY `action_evaluations_actionId_actions_id_fk`;
--> statement-breakpoint
ALTER TABLE `action_events` DROP FOREIGN KEY `action_events_actionId_actions_id_fk`;
--> statement-breakpoint
ALTER TABLE `actions` DROP FOREIGN KEY `actions_obligationId_obligations_id_fk`;
--> statement-breakpoint
ALTER TABLE `actions` DROP FOREIGN KEY `actions_eventId_operational_events_id_fk`;
--> statement-breakpoint
ALTER TABLE `actions` DROP FOREIGN KEY `actions_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `actions` DROP FOREIGN KEY `actions_objectiveId_objectives_id_fk`;
--> statement-breakpoint
ALTER TABLE `analysis_jobs` DROP FOREIGN KEY `analysis_jobs_eventId_inbound_events_id_fk`;
--> statement-breakpoint
ALTER TABLE `conflict_records` DROP FOREIGN KEY `conflict_records_entityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `event_attempts` DROP FOREIGN KEY `event_attempts_eventId_inbound_events_id_fk`;
--> statement-breakpoint
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_supersedesEvidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `external_identities` DROP FOREIGN KEY `external_identities_connectionId_github_connections_id_fk`;
--> statement-breakpoint
ALTER TABLE `external_identities` DROP FOREIGN KEY `external_identities_entityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `follow_ups` DROP FOREIGN KEY `follow_ups_actionId_actions_id_fk`;
--> statement-breakpoint
ALTER TABLE `inbound_events` DROP FOREIGN KEY `inbound_events_connectionId_github_connections_id_fk`;
--> statement-breakpoint
ALTER TABLE `obligations` DROP FOREIGN KEY `obligations_ownerEntityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `obligations` DROP FOREIGN KEY `obligations_counterpartyEntityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `obligations` DROP FOREIGN KEY `obligations_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `obligations` DROP FOREIGN KEY `obligations_completionEvidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `observations` DROP FOREIGN KEY `observations_entityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `observations` DROP FOREIGN KEY `observations_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `observations` DROP FOREIGN KEY `observations_supersedesObservationId_observations_id_fk`;
--> statement-breakpoint
ALTER TABLE `operational_events` DROP FOREIGN KEY `operational_events_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `relationships` DROP FOREIGN KEY `relationships_subjectEntityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `relationships` DROP FOREIGN KEY `relationships_objectEntityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `relationships` DROP FOREIGN KEY `relationships_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `resource_allocations` DROP FOREIGN KEY `resource_allocations_resourceId_resources_id_fk`;
--> statement-breakpoint
ALTER TABLE `resource_allocations` DROP FOREIGN KEY `resource_allocations_obligationId_obligations_id_fk`;
--> statement-breakpoint
ALTER TABLE `resource_allocations` DROP FOREIGN KEY `resource_allocations_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `resource_versions` DROP FOREIGN KEY `resource_versions_resourceId_resources_id_fk`;
--> statement-breakpoint
ALTER TABLE `resource_versions` DROP FOREIGN KEY `resource_versions_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `resource_versions` DROP FOREIGN KEY `resource_versions_supersedesVersionId_resource_versions_id_fk`;
--> statement-breakpoint
ALTER TABLE `responsibility_assignments` DROP FOREIGN KEY `responsibility_assignments_responsibleEntityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `responsibility_assignments` DROP FOREIGN KEY `responsibility_assignments_subjectEntityId_entities_id_fk`;
--> statement-breakpoint
ALTER TABLE `responsibility_assignments` DROP FOREIGN KEY `responsibility_assignments_evidenceId_evidence_id_fk`;
--> statement-breakpoint
ALTER TABLE `responsibility_assignments` DROP FOREIGN KEY `responsibility_supersedes_assignment_fk`;
--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `action_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `entities` ADD CONSTRAINT `entity_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `github_connections` ADD CONSTRAINT `github_connection_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `inbound_events` ADD CONSTRAINT `inbound_event_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `objectives` ADD CONSTRAINT `objective_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligation_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observation_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `operational_events` ADD CONSTRAINT `operational_event_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_version_workspace_resource_id_unique` UNIQUE(`workspaceId`,`resourceId`,`id`);--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resource_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_workspace_id_unique` UNIQUE(`workspaceId`,`id`);--> statement-breakpoint
ALTER TABLE `action_attempts` ADD CONSTRAINT `action_attempt_workspace_action_fk` FOREIGN KEY (`workspaceId`,`actionId`) REFERENCES `actions`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_attempts` ADD CONSTRAINT `action_attempt_workspace_verification_evidence_fk` FOREIGN KEY (`workspaceId`,`verificationEvidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_evaluations` ADD CONSTRAINT `action_evaluation_workspace_action_fk` FOREIGN KEY (`workspaceId`,`actionId`) REFERENCES `actions`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_events` ADD CONSTRAINT `action_event_workspace_action_fk` FOREIGN KEY (`workspaceId`,`actionId`) REFERENCES `actions`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `action_workspace_obligation_fk` FOREIGN KEY (`workspaceId`,`obligationId`) REFERENCES `obligations`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `action_workspace_event_fk` FOREIGN KEY (`workspaceId`,`eventId`) REFERENCES `operational_events`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `action_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `action_workspace_objective_fk` FOREIGN KEY (`workspaceId`,`objectiveId`) REFERENCES `objectives`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD CONSTRAINT `analysis_job_workspace_event_fk` FOREIGN KEY (`workspaceId`,`eventId`) REFERENCES `inbound_events`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conflict_records` ADD CONSTRAINT `conflict_workspace_entity_fk` FOREIGN KEY (`workspaceId`,`entityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_attempts` ADD CONSTRAINT `event_attempt_workspace_event_fk` FOREIGN KEY (`workspaceId`,`eventId`) REFERENCES `inbound_events`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_supersedes_same_workspace_fk` FOREIGN KEY (`workspaceId`,`supersedesEvidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_identities` ADD CONSTRAINT `external_identity_workspace_connection_fk` FOREIGN KEY (`workspaceId`,`connectionId`) REFERENCES `github_connections`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_identities` ADD CONSTRAINT `external_identity_workspace_entity_fk` FOREIGN KEY (`workspaceId`,`entityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_up_workspace_action_fk` FOREIGN KEY (`workspaceId`,`actionId`) REFERENCES `actions`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD CONSTRAINT `inbound_event_workspace_connection_fk` FOREIGN KEY (`workspaceId`,`connectionId`) REFERENCES `github_connections`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligation_workspace_owner_fk` FOREIGN KEY (`workspaceId`,`ownerEntityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligation_workspace_counterparty_fk` FOREIGN KEY (`workspaceId`,`counterpartyEntityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligation_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obligations` ADD CONSTRAINT `obligation_workspace_completion_evidence_fk` FOREIGN KEY (`workspaceId`,`completionEvidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observation_workspace_entity_fk` FOREIGN KEY (`workspaceId`,`entityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observation_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observation_supersedes_same_workspace_fk` FOREIGN KEY (`workspaceId`,`supersedesObservationId`) REFERENCES `observations`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_events` ADD CONSTRAINT `operational_event_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationship_workspace_subject_fk` FOREIGN KEY (`workspaceId`,`subjectEntityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationship_workspace_object_fk` FOREIGN KEY (`workspaceId`,`objectEntityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationship_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocation_workspace_resource_fk` FOREIGN KEY (`workspaceId`,`resourceId`) REFERENCES `resources`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocation_workspace_obligation_fk` FOREIGN KEY (`workspaceId`,`obligationId`) REFERENCES `obligations`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_allocations` ADD CONSTRAINT `resource_allocation_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_version_workspace_resource_fk` FOREIGN KEY (`workspaceId`,`resourceId`) REFERENCES `resources`(`workspaceId`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_version_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_versions` ADD CONSTRAINT `resource_version_supersedes_same_resource_fk` FOREIGN KEY (`workspaceId`,`resourceId`,`supersedesVersionId`) REFERENCES `resource_versions`(`workspaceId`,`resourceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_workspace_responsible_entity_fk` FOREIGN KEY (`workspaceId`,`responsibleEntityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_workspace_subject_entity_fk` FOREIGN KEY (`workspaceId`,`subjectEntityId`) REFERENCES `entities`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_workspace_evidence_fk` FOREIGN KEY (`workspaceId`,`evidenceId`) REFERENCES `evidence`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibility_assignments` ADD CONSTRAINT `responsibility_supersedes_same_workspace_fk` FOREIGN KEY (`workspaceId`,`supersedesAssignmentId`) REFERENCES `responsibility_assignments`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;
