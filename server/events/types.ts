import { z } from "zod";

export const manualObservationPayloadSchema = z.object({
  kind: z.literal("manual_observation"),
  sourceName: z.string().trim().min(1).max(200),
  sourceAuthority: z.enum(["unknown", "reported", "direct", "official"]),
  sourceRef: z.string().trim().max(240).nullable(),
  claim: z.string().trim().min(1).max(5000),
  observedAt: z.string().datetime(),
  validFrom: z.string().datetime().nullable(),
  validTo: z.string().datetime().nullable(),
  entityId: z.number().int().positive().nullable(),
  obligationId: z.number().int().positive().nullable(),
  attributeKey: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(5000),
  epistemicState: z.enum(["observed", "derived", "inferred", "predicted"]),
  qualityState: z.enum(["current", "unknown", "uncertain", "incomplete", "unavailable", "unresolved", "stale", "conflicting"]),
  confidence: z.number().int().min(0).max(100),
  supersedesObservationId: z.number().int().positive().nullable(),
}).strict();

export const githubIssuePayloadSchema = z.object({
  kind: z.literal("github_issue"),
  repository: z.object({ id: z.string().regex(/^\d+$/), fullName: z.string().min(3).max(201) }).strict(),
  issue: z.object({
    id: z.string().regex(/^\d+$/),
    number: z.number().int().positive(),
    title: z.string().max(500),
    // Accept the previous persisted shape during deployment; new webhook payloads
    // are bounded to 1,500 characters by normalizeGitHubIssuePayload below.
    body: z.string().max(12_000).nullable(),
    state: z.enum(["open", "closed"]),
    htmlUrl: z.string().url().max(500),
    updatedAt: z.string().datetime().nullable(),
  }).strict(),
  // Sender identity was stored by an earlier release but is not consumed by the worker.
  sender: z.object({ id: z.string().regex(/^\d+$/), login: z.string().max(100) }).strict().optional(),
  eventAction: z.enum(["opened", "edited", "closed", "reopened", "assigned", "unassigned", "labeled", "unlabeled", "milestoned", "demilestoned"]),
}).strict();

export type ManualObservationPayload = z.infer<typeof manualObservationPayloadSchema>;
export type GitHubIssuePayload = z.infer<typeof githubIssuePayloadSchema>;

export function normalizeGitHubIssuePayload(source: {
  action: string;
  repository: { id: string | number; full_name: string };
  issue: {
    id: string | number;
    number: number;
    title: string;
    body?: string | null;
    state: "open" | "closed";
    html_url: string;
    updated_at?: string | null;
  };
}) {
  return githubIssuePayloadSchema.safeParse({
    kind: "github_issue",
    repository: { id: String(source.repository.id), fullName: source.repository.full_name },
    issue: {
      id: String(source.issue.id),
      number: source.issue.number,
      title: source.issue.title,
      body: (source.issue.body ?? null)?.slice(0, 1_500) ?? null,
      state: source.issue.state,
      htmlUrl: source.issue.html_url,
      updatedAt: source.issue.updated_at ?? null,
    },
    eventAction: source.action,
  });
}

export function compactProcessedGitHubIssuePayload(payloadUnknown: unknown): GitHubIssuePayload {
  const payload = githubIssuePayloadSchema.parse(payloadUnknown);
  return {
    kind: payload.kind,
    repository: payload.repository,
    issue: { ...payload.issue, body: null },
    eventAction: payload.eventAction,
  };
}
