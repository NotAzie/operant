import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["personal", "organization"]).default("personal").notNull(),
  isIllustrative: boolean("isIllustrative").default(false).notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("workspace_created_by_idx").on(table.createdBy)]);

export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["owner", "admin", "editor", "viewer"]).default("editor").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_member_unique").on(table.workspaceId, table.userId),
  index("workspace_member_user_idx").on(table.userId),
]);

export const workspacePolicies = mysqlTable("workspace_policies", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  key: mysqlEnum("key", ["due_soon_days", "stale_after_days"]).notNull(),
  value: int("value").notNull(),
  updatedBy: int("updatedBy").notNull().references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("workspace_policy_unique").on(table.workspaceId, table.key)]);

export const entities = mysqlTable("entities", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  displayName: varchar("displayName", { length: 200 }).notNull(),
  description: text("description"),
  sourceIdentity: varchar("sourceIdentity", { length: 220 }),
  identityState: mysqlEnum("identityState", ["resolved", "unresolved"]).default("unresolved").notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("entity_workspace_name_idx").on(table.workspaceId, table.displayName), uniqueIndex("entity_workspace_id_unique").on(table.workspaceId, table.id)]);

export const githubConnections = mysqlTable("github_connections", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: mysqlEnum("provider", ["github"]).default("github").notNull(),
  repositoryId: varchar("repositoryId", { length: 64 }).notNull(),
  repositoryOwner: varchar("repositoryOwner", { length: 100 }).notNull(),
  repositoryName: varchar("repositoryName", { length: 100 }).notNull(),
  repositoryUrl: varchar("repositoryUrl", { length: 500 }).notNull(),
  encryptedAccessToken: text("encryptedAccessToken"),
  encryptedWebhookSecret: text("encryptedWebhookSecret"),
  status: mysqlEnum("status", ["active", "reauthorization_required", "disconnected", "error"]).default("active").notNull(),
  lastValidatedAt: timestamp("lastValidatedAt"),
  lastWebhookAt: timestamp("lastWebhookAt"),
  lastErrorCode: varchar("lastErrorCode", { length: 80 }),
  lastErrorAt: timestamp("lastErrorAt"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("github_connection_workspace_repo_unique").on(table.workspaceId, table.repositoryId),
  index("github_connection_workspace_status_idx").on(table.workspaceId, table.status),
  uniqueIndex("github_connection_workspace_id_unique").on(table.workspaceId, table.id),
]);

export const inboundEvents = mysqlTable("inbound_events", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  connectionId: int("connectionId"),
  provider: mysqlEnum("provider", ["github", "manual"]).notNull(),
  deliveryId: varchar("deliveryId", { length: 120 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 180 }).notNull(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  eventAction: varchar("eventAction", { length: 100 }).notNull(),
  sourceExternalId: varchar("sourceExternalId", { length: 240 }).notNull(),
  correlationId: varchar("correlationId", { length: 64 }).notNull(),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  resultPayload: json("resultPayload").$type<Record<string, unknown>>(),
  actorId: int("actorId").references(() => users.id, { onDelete: "set null" }),
  happenedAt: timestamp("happenedAt"),
  observedAt: timestamp("observedAt").notNull(),
  status: mysqlEnum("status", ["queued", "processing", "processed", "retryable_failure", "dead_letter", "ignored"]).default("queued").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(5).notNull(),
  nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
  leaseOwner: varchar("leaseOwner", { length: 100 }),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  processedAt: timestamp("processedAt"),
  deadLetteredAt: timestamp("deadLetteredAt"),
  lastErrorClass: varchar("lastErrorClass", { length: 80 }),
  lastErrorMessage: varchar("lastErrorMessage", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("inbound_event_delivery_unique").on(table.connectionId, table.deliveryId),
  uniqueIndex("inbound_event_idempotency_unique").on(table.idempotencyKey),
  index("inbound_event_due_idx").on(table.status, table.nextAttemptAt, table.leaseExpiresAt),
  index("inbound_event_workspace_time_idx").on(table.workspaceId, table.createdAt),
  uniqueIndex("inbound_event_workspace_id_unique").on(table.workspaceId, table.id),
  foreignKey({ name: "inbound_event_workspace_connection_fk", columns: [table.workspaceId, table.connectionId], foreignColumns: [githubConnections.workspaceId, githubConnections.id] }).onDelete("restrict"),
]);

export const evidence = mysqlTable("evidence", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  sourceName: varchar("sourceName", { length: 200 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["manual", "sample", "integration"]).default("manual").notNull(),
  sourceAuthority: mysqlEnum("sourceAuthority", ["unknown", "reported", "direct", "official"]).default("unknown").notNull(),
  sourceRef: varchar("sourceRef", { length: 240 }),
  claim: text("claim").notNull(),
  sourceEventId: int("sourceEventId"),
  observedAt: timestamp("observedAt").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  validFrom: timestamp("validFrom"),
  validTo: timestamp("validTo"),
  epistemicState: mysqlEnum("epistemicState", ["observed", "derived", "inferred", "predicted"]).default("observed").notNull(),
  qualityState: mysqlEnum("qualityState", ["current", "unknown", "uncertain", "incomplete", "unavailable", "unresolved", "stale", "conflicting"]).default("current").notNull(),
  confidence: int("confidence").default(100).notNull(),
  supersedesEvidenceId: int("supersedesEvidenceId"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("evidence_workspace_observed_idx").on(table.workspaceId, table.observedAt),
  index("evidence_workspace_source_idx").on(table.workspaceId, table.sourceName),
  index("evidence_workspace_source_event_idx").on(table.workspaceId, table.sourceEventId),
  uniqueIndex("evidence_workspace_id_unique").on(table.workspaceId, table.id),
  foreignKey({ name: "evidence_workspace_source_event_fk", columns: [table.workspaceId, table.sourceEventId], foreignColumns: [inboundEvents.workspaceId, inboundEvents.id] }).onDelete("restrict"),
  foreignKey({ name: "evidence_supersedes_same_workspace_fk", columns: [table.workspaceId, table.supersedesEvidenceId], foreignColumns: [table.workspaceId, table.id] }).onDelete("restrict"),
]);

export const observations = mysqlTable("observations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  entityId: int("entityId"),
  obligationId: int("obligationId").references((): AnyMySqlColumn => obligations.id, { onDelete: "set null" }),
  evidenceId: int("evidenceId").notNull(),
  attributeKey: varchar("attributeKey", { length: 120 }).notNull(),
  value: text("value").notNull(),
  epistemicState: mysqlEnum("epistemicState", ["observed", "derived", "inferred", "predicted"]).default("observed").notNull(),
  confidence: int("confidence").default(100).notNull(),
  observedAt: timestamp("observedAt").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  validFrom: timestamp("validFrom"),
  validTo: timestamp("validTo"),
  supersedesObservationId: int("supersedesObservationId"),
  sourceEventId: int("sourceEventId"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("observation_workspace_entity_idx").on(table.workspaceId, table.entityId),
  index("observation_workspace_obligation_idx").on(table.workspaceId, table.obligationId),
  index("observation_workspace_key_idx").on(table.workspaceId, table.attributeKey),
  index("observation_workspace_source_event_idx").on(table.workspaceId, table.sourceEventId),
  uniqueIndex("observation_workspace_id_unique").on(table.workspaceId, table.id),
  foreignKey({ name: "observation_workspace_entity_fk", columns: [table.workspaceId, table.entityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
  foreignKey({ name: "observation_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
  foreignKey({ name: "observation_workspace_source_event_fk", columns: [table.workspaceId, table.sourceEventId], foreignColumns: [inboundEvents.workspaceId, inboundEvents.id] }).onDelete("restrict"),
  foreignKey({ name: "observation_supersedes_same_workspace_fk", columns: [table.workspaceId, table.supersedesObservationId], foreignColumns: [table.workspaceId, table.id] }).onDelete("restrict"),
]);

export const relationships = mysqlTable("relationships", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  subjectEntityId: int("subjectEntityId").notNull(),
  predicate: varchar("predicate", { length: 100 }).notNull(),
  objectEntityId: int("objectEntityId").notNull(),
  evidenceId: int("evidenceId"),
  epistemicState: mysqlEnum("epistemicState", ["observed", "inferred", "unresolved", "rejected"]).default("observed").notNull(),
  confidence: int("confidence").default(100).notNull(),
  validFrom: timestamp("validFrom").defaultNow().notNull(),
  validTo: timestamp("validTo"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("relationship_workspace_subject_idx").on(table.workspaceId, table.subjectEntityId),
  index("relationship_workspace_object_idx").on(table.workspaceId, table.objectEntityId),
  foreignKey({ name: "relationship_workspace_subject_fk", columns: [table.workspaceId, table.subjectEntityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
  foreignKey({ name: "relationship_workspace_object_fk", columns: [table.workspaceId, table.objectEntityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
  foreignKey({ name: "relationship_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
]);

export const obligations = mysqlTable("obligations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  ownerEntityId: int("ownerEntityId"),
  counterpartyEntityId: int("counterpartyEntityId"),
  dueAt: timestamp("dueAt"),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }),
  status: mysqlEnum("status", ["open", "satisfied", "cancelled", "disputed"]).default("open").notNull(),
  evidenceId: int("evidenceId"),
  completionEvidenceId: int("completionEvidenceId"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("obligation_workspace_due_idx").on(table.workspaceId, table.status, table.dueAt),
  uniqueIndex("obligation_workspace_id_unique").on(table.workspaceId, table.id),
  foreignKey({ name: "obligation_workspace_owner_fk", columns: [table.workspaceId, table.ownerEntityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
  foreignKey({ name: "obligation_workspace_counterparty_fk", columns: [table.workspaceId, table.counterpartyEntityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
  foreignKey({ name: "obligation_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
  foreignKey({ name: "obligation_workspace_completion_evidence_fk", columns: [table.workspaceId, table.completionEvidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
]);

export const operationalEvents = mysqlTable("operational_events", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  recordType: varchar("recordType", { length: 64 }).notNull(),
  recordId: int("recordId"),
  summary: varchar("summary", { length: 500 }).notNull(),
  evidenceId: int("evidenceId"),
  happenedAt: timestamp("happenedAt"),
  expectedAt: timestamp("expectedAt"),
  observedAt: timestamp("observedAt"),
  sourceProvider: mysqlEnum("sourceProvider", ["github"]),
  sourceExternalId: varchar("sourceExternalId", { length: 240 }),
  correlationId: varchar("correlationId", { length: 64 }),
  causationId: varchar("causationId", { length: 64 }),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  epistemicState: mysqlEnum("epistemicState", ["observed", "derived", "inferred", "predicted", "executed", "confirmed"]).default("observed").notNull(),
  actorId: int("actorId").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  index("operational_event_workspace_time_idx").on(table.workspaceId, table.recordedAt),
  uniqueIndex("operational_event_workspace_id_unique").on(table.workspaceId, table.id),
  foreignKey({ name: "operational_event_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
]);

export const objectives = mysqlTable("objectives", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["required", "preference"]).default("preference").notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("workspace_objective_idx").on(table.workspaceId, table.active), uniqueIndex("objective_workspace_id_unique").on(table.workspaceId, table.id)]);

export type ActionDecisionProvenance = {
  version: 1;
  capturedAt: string;
  basis: "manual" | "illustrative";
  target: { kind: "obligation" | "event"; id: number; label: string };
  objective: { id: number; title: string; priority: "required" | "preference" } | null;
  policySnapshot: { dueSoonDays: number; staleAfterDays: number };
  rules: Array<{ id: "obligation_due_date" | "evidence_freshness" | "evidence_quality" | "evidence_conflicts"; result: string; reason: string }>;
  evidence: {
    id: number;
    sourceName: string;
    sourceType: "manual" | "sample" | "integration";
    sourceAuthority: "unknown" | "reported" | "direct" | "official";
    epistemicState: "observed" | "derived" | "inferred" | "predicted";
    qualityState: "current" | "unknown" | "uncertain" | "incomplete" | "unavailable" | "unresolved" | "stale" | "conflicting";
    confidence: number;
    observedAt: string;
    recordedAt: string;
    validFrom: string | null;
    validTo: string | null;
    ageDaysAtCapture: number;
  } | null;
  selectedAction: { type: "internal_follow_up" | "github_issue_comment"; title: string; dueAt: string | null };
};

export const actions = mysqlTable("actions", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actionType: mysqlEnum("actionType", ["internal_follow_up", "github_issue_comment"]).default("internal_follow_up").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  obligationId: int("obligationId"),
  eventId: int("eventId"),
  evidenceId: int("evidenceId"),
  objectiveId: int("objectiveId"),
  decisionProvenance: json("decisionProvenance").$type<ActionDecisionProvenance>(),
  dueAt: timestamp("dueAt"),
  status: mysqlEnum("status", ["proposed", "authorized", "submitted", "accepted", "executing", "confirmed", "failed", "rejected", "expired", "unknown"]).default("proposed").notNull(),
  proposedBy: int("proposedBy").notNull().references(() => users.id),
  authorizedBy: int("authorizedBy").references(() => users.id, { onDelete: "set null" }),
  outcome: text("outcome"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("action_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
  uniqueIndex("action_workspace_id_unique").on(table.workspaceId, table.id),
  foreignKey({ name: "action_workspace_obligation_fk", columns: [table.workspaceId, table.obligationId], foreignColumns: [obligations.workspaceId, obligations.id] }).onDelete("restrict"),
  foreignKey({ name: "action_workspace_event_fk", columns: [table.workspaceId, table.eventId], foreignColumns: [operationalEvents.workspaceId, operationalEvents.id] }).onDelete("restrict"),
  foreignKey({ name: "action_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
  foreignKey({ name: "action_workspace_objective_fk", columns: [table.workspaceId, table.objectiveId], foreignColumns: [objectives.workspaceId, objectives.id] }).onDelete("restrict"),
]);

export const followUps = mysqlTable("follow_ups", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actionId: int("actionId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  dueAt: timestamp("dueAt"),
  status: mysqlEnum("status", ["open", "completed"]).default("open").notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  completedBy: int("completedBy").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  uniqueIndex("follow_up_action_unique").on(table.actionId),
  index("follow_up_workspace_status_idx").on(table.workspaceId, table.status, table.dueAt),
  foreignKey({ name: "follow_up_workspace_action_fk", columns: [table.workspaceId, table.actionId], foreignColumns: [actions.workspaceId, actions.id] }).onDelete("cascade"),
]);

export const actionEvents = mysqlTable("action_events", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actionId: int("actionId").notNull(),
  fromState: mysqlEnum("fromState", ["proposed", "authorized", "submitted", "accepted", "executing", "confirmed", "failed", "rejected", "expired", "unknown"]),
  toState: mysqlEnum("toState", ["proposed", "authorized", "submitted", "accepted", "executing", "confirmed", "failed", "rejected", "expired", "unknown"]).notNull(),
  actorId: int("actorId").notNull().references(() => users.id),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("action_event_workspace_time_idx").on(table.workspaceId, table.createdAt),
  foreignKey({ name: "action_event_workspace_action_fk", columns: [table.workspaceId, table.actionId], foreignColumns: [actions.workspaceId, actions.id] }).onDelete("cascade"),
]);

export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: int("actorId").references(() => users.id, { onDelete: "set null" }),
  operation: varchar("operation", { length: 100 }).notNull(),
  recordType: varchar("recordType", { length: 64 }).notNull(),
  recordId: int("recordId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("audit_workspace_time_idx").on(table.workspaceId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type Obligation = typeof obligations.$inferSelect;
export type Action = typeof actions.$inferSelect;


export type GitHubIssueEventSnapshot = {
  repository: { id: string; fullName: string };
  issue: { id: string; number: number; title: string; state: "open" | "closed"; htmlUrl: string; updatedAt: string | null };
  sender: { id: string; login: string };
  eventAction: string;
};

export const externalIdentities = mysqlTable("external_identities", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  connectionId: int("connectionId"),
  provider: mysqlEnum("provider", ["github"]).notNull(),
  externalKind: mysqlEnum("externalKind", ["repository", "issue", "user"]).notNull(),
  externalId: varchar("externalId", { length: 255 }).notNull(),
  externalUrl: varchar("externalUrl", { length: 500 }),
  entityId: int("entityId"),
  identityState: mysqlEnum("identityState", ["resolved", "unresolved"]).default("unresolved").notNull(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("external_identity_scope_unique").on(table.workspaceId, table.provider, table.externalKind, table.externalId),
  index("external_identity_entity_idx").on(table.workspaceId, table.entityId),
  foreignKey({ name: "external_identity_workspace_connection_fk", columns: [table.workspaceId, table.connectionId], foreignColumns: [githubConnections.workspaceId, githubConnections.id] }).onDelete("restrict"),
  foreignKey({ name: "external_identity_workspace_entity_fk", columns: [table.workspaceId, table.entityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
]);

export const eventAttempts = mysqlTable("event_attempts", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  eventId: int("eventId").notNull(),
  attemptNumber: int("attemptNumber").notNull(),
  outcome: mysqlEnum("outcome", ["started", "succeeded", "retry_scheduled", "dead_letter", "ignored"]).notNull(),
  startedAt: timestamp("startedAt").notNull(),
  finishedAt: timestamp("finishedAt"),
  errorClass: varchar("errorClass", { length: 80 }),
  errorMessage: varchar("errorMessage", { length: 500 }),
}, (table) => [
  uniqueIndex("event_attempt_number_unique").on(table.eventId, table.attemptNumber),
  index("event_attempt_workspace_time_idx").on(table.workspaceId, table.startedAt),
  foreignKey({ name: "event_attempt_workspace_event_fk", columns: [table.workspaceId, table.eventId], foreignColumns: [inboundEvents.workspaceId, inboundEvents.id] }).onDelete("cascade"),
]);

export const conflictRecords = mysqlTable("conflict_records", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  conflictKey: varchar("conflictKey", { length: 64 }).notNull(),
  entityId: int("entityId"),
  attributeKey: varchar("attributeKey", { length: 120 }).notNull(),
  observationIds: json("observationIds").$type<number[]>().notNull(),
  status: mysqlEnum("status", ["active", "resolved"]).default("active").notNull(),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy").references(() => users.id, { onDelete: "set null" }),
  resolution: text("resolution"),
}, (table) => [
  index("conflict_workspace_status_idx").on(table.workspaceId, table.status, table.detectedAt),
  uniqueIndex("conflict_workspace_key_unique").on(table.workspaceId, table.conflictKey),
  foreignKey({ name: "conflict_workspace_entity_fk", columns: [table.workspaceId, table.entityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
]);

export const resources = mysqlTable("resources", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  resourceType: varchar("resourceType", { length: 80 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("resource_workspace_type_idx").on(table.workspaceId, table.resourceType), uniqueIndex("resource_workspace_id_unique").on(table.workspaceId, table.id)]);

export const resourceVersions = mysqlTable("resource_versions", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  resourceId: int("resourceId").notNull(),
  capacity: decimal("capacity", { precision: 14, scale: 3 }),
  unit: varchar("unit", { length: 40 }),
  availabilityState: mysqlEnum("availabilityState", ["available", "limited", "unavailable", "unknown"]).default("unknown").notNull(),
  validFrom: timestamp("validFrom").notNull(),
  validTo: timestamp("validTo"),
  evidenceId: int("evidenceId"),
  supersedesVersionId: int("supersedesVersionId"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("resource_version_workspace_time_idx").on(table.workspaceId, table.resourceId, table.recordedAt),
  uniqueIndex("resource_version_workspace_resource_id_unique").on(table.workspaceId, table.resourceId, table.id),
  foreignKey({ name: "resource_version_workspace_resource_fk", columns: [table.workspaceId, table.resourceId], foreignColumns: [resources.workspaceId, resources.id] }).onDelete("cascade"),
  foreignKey({ name: "resource_version_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
  foreignKey({ name: "resource_version_supersedes_same_resource_fk", columns: [table.workspaceId, table.resourceId, table.supersedesVersionId], foreignColumns: [table.workspaceId, table.resourceId, table.id] }).onDelete("restrict"),
]);

export const resourceAllocations = mysqlTable("resource_allocations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  resourceId: int("resourceId").notNull(),
  obligationId: int("obligationId"),
  amount: decimal("amount", { precision: 14, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 40 }).notNull(),
  status: mysqlEnum("status", ["planned", "active", "released", "unknown"]).default("planned").notNull(),
  validFrom: timestamp("validFrom").notNull(),
  validTo: timestamp("validTo"),
  evidenceId: int("evidenceId"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("resource_allocation_workspace_time_idx").on(table.workspaceId, table.resourceId, table.validFrom),
  foreignKey({ name: "resource_allocation_workspace_resource_fk", columns: [table.workspaceId, table.resourceId], foreignColumns: [resources.workspaceId, resources.id] }).onDelete("cascade"),
  foreignKey({ name: "resource_allocation_workspace_obligation_fk", columns: [table.workspaceId, table.obligationId], foreignColumns: [obligations.workspaceId, obligations.id] }).onDelete("restrict"),
  foreignKey({ name: "resource_allocation_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
]);

export const responsibilityAssignments = mysqlTable("responsibility_assignments", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  responsibleUserId: int("responsibleUserId").references(() => users.id, { onDelete: "set null" }),
  responsibleEntityId: int("responsibleEntityId"),
  subjectEntityId: int("subjectEntityId"),
  responsibilityType: varchar("responsibilityType", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["active", "delegated", "ended", "unknown"]).default("active").notNull(),
  validFrom: timestamp("validFrom").notNull(),
  validTo: timestamp("validTo"),
  evidenceId: int("evidenceId"),
  supersedesAssignmentId: int("supersedesAssignmentId"),
  createdBy: int("createdBy").notNull().references(() => users.id),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("responsibility_workspace_time_idx").on(table.workspaceId, table.responsibilityType, table.recordedAt),
  uniqueIndex("responsibility_workspace_id_unique").on(table.workspaceId, table.id),
  foreignKey({ name: "responsibility_workspace_responsible_entity_fk", columns: [table.workspaceId, table.responsibleEntityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
  foreignKey({ name: "responsibility_workspace_subject_entity_fk", columns: [table.workspaceId, table.subjectEntityId], foreignColumns: [entities.workspaceId, entities.id] }).onDelete("restrict"),
  foreignKey({ name: "responsibility_workspace_evidence_fk", columns: [table.workspaceId, table.evidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
  foreignKey({ name: "responsibility_supersedes_same_workspace_fk", columns: [table.workspaceId, table.supersedesAssignmentId], foreignColumns: [table.workspaceId, table.id] }).onDelete("restrict"),
]);

export const actionEvaluations = mysqlTable("action_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actionId: int("actionId").notNull(),
  actorId: int("actorId").notNull().references(() => users.id),
  actorRole: mysqlEnum("actorRole", ["owner", "admin", "editor", "viewer"]).notNull(),
  scopeSnapshot: json("scopeSnapshot").$type<Record<string, unknown>>().notNull(),
  riskLevel: mysqlEnum("riskLevel", ["low", "moderate", "high", "critical"]).notNull(),
  requiredRole: mysqlEnum("requiredRole", ["owner", "admin", "editor"]).notNull(),
  approvalRequired: boolean("approvalRequired").default(true).notNull(),
  policySnapshot: json("policySnapshot").$type<Record<string, unknown>>().notNull(),
  rationale: text("rationale").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("action_evaluation_workspace_idx").on(table.workspaceId, table.actionId, table.createdAt),
  foreignKey({ name: "action_evaluation_workspace_action_fk", columns: [table.workspaceId, table.actionId], foreignColumns: [actions.workspaceId, actions.id] }).onDelete("cascade"),
]);

export const actionAttempts = mysqlTable("action_attempts", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actionId: int("actionId").notNull(),
  provider: mysqlEnum("provider", ["github"]).notNull(),
  operation: varchar("operation", { length: 80 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["prepared", "submitting", "provider_accepted", "verified", "failed", "unknown"]).default("prepared").notNull(),
  requestPreview: text("requestPreview").notNull(),
  requestHash: varchar("requestHash", { length: 64 }).notNull(),
  authorizedRequestHash: varchar("authorizedRequestHash", { length: 64 }),
  providerContext: json("providerContext").$type<Record<string, unknown>>(),
  providerRequestId: varchar("providerRequestId", { length: 160 }),
  providerObjectId: varchar("providerObjectId", { length: 160 }),
  providerResponseMetadata: json("providerResponseMetadata").$type<Record<string, unknown>>(),
  attemptCount: int("attemptCount").default(0).notNull(),
  errorClass: varchar("errorClass", { length: 80 }),
  errorMessage: varchar("errorMessage", { length: 500 }),
  verificationEvidenceId: int("verificationEvidenceId"),
  submittedAt: timestamp("submittedAt"),
  verifiedAt: timestamp("verifiedAt"),
  completedAt: timestamp("completedAt"),
  initiatedBy: int("initiatedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("action_attempt_idempotency_unique").on(table.idempotencyKey),
  index("action_attempt_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
  index("action_attempt_action_idx").on(table.workspaceId, table.actionId, table.createdAt),
  foreignKey({ name: "action_attempt_workspace_action_fk", columns: [table.workspaceId, table.actionId], foreignColumns: [actions.workspaceId, actions.id] }).onDelete("cascade"),
  foreignKey({ name: "action_attempt_workspace_verification_evidence_fk", columns: [table.workspaceId, table.verificationEvidenceId], foreignColumns: [evidence.workspaceId, evidence.id] }).onDelete("restrict"),
]);

export const reasoningRuns = mysqlTable("reasoning_runs", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  trigger: mysqlEnum("trigger", ["manual", "event"]).default("manual").notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed", "unavailable"]).default("running").notNull(),
  modelId: varchar("modelId", { length: 160 }).notNull(),
  contextHash: varchar("contextHash", { length: 64 }).notNull(),
  contextSnapshot: json("contextSnapshot").$type<Record<string, unknown>>().notNull(),
  evidenceIds: json("evidenceIds").$type<number[]>().notNull(),
  objectiveSnapshot: json("objectiveSnapshot").$type<Record<string, unknown>[]>().notNull(),
  policySnapshot: json("policySnapshot").$type<Record<string, unknown>>().notNull(),
  rulesSnapshot: json("rulesSnapshot").$type<Record<string, unknown>[]>().notNull(),
  promptVersion: varchar("promptVersion", { length: 40 }).notNull(),
  output: json("output").$type<Record<string, unknown> | null>(),
  errorClass: varchar("errorClass", { length: 80 }),
  errorMessage: varchar("errorMessage", { length: 500 }),
  promptTokens: int("promptTokens"),
  completionTokens: int("completionTokens"),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [index("reasoning_workspace_time_idx").on(table.workspaceId, table.startedAt)]);

export const analysisJobs = mysqlTable("analysis_jobs", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  eventId: int("eventId").notNull(),
  status: mysqlEnum("status", ["queued", "completed", "failed", "dismissed"]).default("queued").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  completedBy: int("completedBy").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  uniqueIndex("analysis_job_event_unique").on(table.eventId),
  index("analysis_job_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
  foreignKey({ name: "analysis_job_workspace_event_fk", columns: [table.workspaceId, table.eventId], foreignColumns: [inboundEvents.workspaceId, inboundEvents.id] }).onDelete("cascade"),
]);

export const workerSchedules = mysqlTable("worker_schedules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  taskUid: varchar("taskUid", { length: 120 }).notNull(),
  cronExpression: varchar("cronExpression", { length: 80 }).notNull(),
  active: boolean("active").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  lastError: varchar("lastError", { length: 500 }),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("worker_schedule_name_unique").on(table.name),
  uniqueIndex("worker_schedule_task_uid_unique").on(table.taskUid),
]);

export const rateLimitBuckets = mysqlTable("rate_limit_buckets", {
  id: int("id").autoincrement().primaryKey(),
  bucketKey: varchar("bucketKey", { length: 64 }).notNull().unique(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  hitCount: int("hitCount").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
