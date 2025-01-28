ALTER TABLE `actions` ADD `objectiveId` int;--> statement-breakpoint
ALTER TABLE `actions` ADD `decisionProvenance` json;--> statement-breakpoint
ALTER TABLE `actions` ADD CONSTRAINT `actions_objectiveId_objectives_id_fk` FOREIGN KEY (`objectiveId`) REFERENCES `objectives`(`id`) ON DELETE set null ON UPDATE no action;