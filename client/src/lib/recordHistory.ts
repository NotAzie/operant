type AuditDetails = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  from?: unknown;
  to?: unknown;
  evidenceId?: unknown;
  completionEvidenceId?: unknown;
  dueAt?: unknown;
  entityType?: unknown;
  identityState?: unknown;
  sourceName?: unknown;
  attributeKey?: unknown;
  supersedesObservationId?: unknown;
  subjectEntityId?: unknown;
  objectEntityId?: unknown;
  predicate?: unknown;
  [key: string]: unknown;
};

export function describeAuditEntry(operation: string, rawDetails: string | null): string {
  if (!rawDetails) return "No additional details recorded.";
  let details: AuditDetails;
  try {
    details = JSON.parse(rawDetails) as AuditDetails;
  } catch {
    return rawDetails;
  }

  if (details.before && details.after) {
    const labels: Record<string, string> = {
      displayName: "name",
      description: "description",
      sourceIdentity: "source identity",
      identityState: "identity state",
    };
    const changes = Object.keys(labels).flatMap((key) => {
      const before = details.before?.[key];
      const after = details.after?.[key];
      return before === after ? [] : [`${labels[key]}: ${String(before ?? "(empty)")} → ${String(after ?? "(empty)")}`];
    });
    return changes.length ? changes.join(" · ") : "Record correction saved.";
  }

  if (operation === "obligation.status_changed") {
    return `Status: ${String(details.from ?? "unknown")} → ${String(details.to ?? "unknown")}${details.completionEvidenceId ? ` · completion evidence #${String(details.completionEvidenceId)}` : ""}`;
  }
  if (operation === "obligation.created") {
    const due = details.dueAt ? ` · due ${new Date(String(details.dueAt)).toLocaleDateString()}` : " · no due date";
    return `Source evidence #${String(details.evidenceId ?? "unknown")}${due}`;
  }
  if (operation.startsWith("identity.candidate_")) {
    return `${String(details.from ?? "unresolved")} → ${String(details.to ?? operation.slice("identity.candidate_".length))} · evidence #${String(details.evidenceId ?? "unknown")} · entity records remain separate`;
  }
  if (operation === "entity.created") {
    return `${String(details.entityType ?? "Entity")} · identity ${String(details.identityState ?? "unresolved")}`;
  }
  if (operation === "observation.corrected" || operation === "observation.created") {
    return `${String(details.attributeKey ?? "Observation")}${details.sourceName ? ` · ${String(details.sourceName)}` : ""}${details.supersedesObservationId ? ` · supersedes observation #${String(details.supersedesObservationId)}` : ""}`;
  }
  return Object.entries(details).map(([key, value]) => `${key}: ${String(value ?? "none")}`).join(" · ") || "No additional details recorded.";
}

export function auditOperationLabel(operation: string): string {
  return operation.replace(/[._]/g, " ");
}
