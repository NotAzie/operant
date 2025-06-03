-- Before applying, pause event writes and confirm both read-only preflight counts are zero:
-- SELECT COUNT(*) FROM evidence e JOIN inbound_events ev ON ev.id = e.sourceEventId WHERE e.sourceEventId IS NOT NULL AND e.workspaceId <> ev.workspaceId;
-- SELECT COUNT(*) FROM observations o JOIN inbound_events ev ON ev.id = o.sourceEventId WHERE o.sourceEventId IS NOT NULL AND o.workspaceId <> ev.workspaceId;
-- TiDB 8.5 requires FK-changing ALTER TABLE statements to run with session FK checks disabled.
-- Run through a dedicated migration connection; restore checks before that connection is reused.
SET SESSION foreign_key_checks = 0;
--> statement-breakpoint
CREATE INDEX `evidence_workspace_source_event_idx` ON `evidence` (`workspaceId`,`sourceEventId`);
--> statement-breakpoint
CREATE INDEX `observation_workspace_source_event_idx` ON `observations` (`workspaceId`,`sourceEventId`);
--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_workspace_source_event_fk` FOREIGN KEY (`workspaceId`,`sourceEventId`) REFERENCES `inbound_events`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observation_workspace_source_event_fk` FOREIGN KEY (`workspaceId`,`sourceEventId`) REFERENCES `inbound_events`(`workspaceId`,`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_sourceEventId_inbound_events_id_fk`;
--> statement-breakpoint
ALTER TABLE `observations` DROP FOREIGN KEY `observations_sourceEventId_inbound_events_id_fk`;
--> statement-breakpoint
ALTER TABLE `evidence` DROP INDEX `evidence_sourceEventId_inbound_events_id_fk`;
--> statement-breakpoint
ALTER TABLE `observations` DROP INDEX `observations_sourceEventId_inbound_events_id_fk`;
--> statement-breakpoint
SET SESSION foreign_key_checks = 1;
