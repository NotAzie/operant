import { describe, expect, it } from "vitest";
import { compactProcessedGitHubIssuePayload, githubIssuePayloadSchema, manualObservationPayloadSchema, normalizeGitHubIssuePayload } from "./types";

describe("normalized event input contracts", () => {
  it("accepts a bounded normalized GitHub issue event", () => {
    const payload = {
      kind: "github_issue",
      repository: { id: "123456", fullName: "example/service" },
      issue: { id: "654321", number: 17, title: "Investigate timeout", body: null, state: "open", htmlUrl: "https://github.com/example/service/issues/17", updatedAt: "2026-09-29T12:00:00.000Z" },
      eventAction: "opened",
    };
    expect(githubIssuePayloadSchema.parse(payload)).toEqual(payload);
  });

  it("rejects unknown routing fields and payloads beyond the legacy compatibility bound", () => {
    const payload = {
      kind: "github_issue",
      repository: { id: "123456", fullName: "example/service" },
      issue: { id: "654321", number: 17, title: "Investigate timeout", body: "x".repeat(12_001), state: "open", htmlUrl: "https://github.com/example/service/issues/17", updatedAt: null },
      eventAction: "opened",
      workspaceId: 999,
    };
    expect(githubIssuePayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("normalizes only retry-required issue fields and caps retained issue text", () => {
    const normalized = normalizeGitHubIssuePayload({
      action: "edited",
      repository: { id: 123456, full_name: "example/service" },
      issue: { id: 654321, number: 17, title: "Investigate timeout", body: "x".repeat(8_000), state: "open", html_url: "https://github.com/example/service/issues/17", updated_at: null },
    });
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.data.issue.body).toHaveLength(1_500);
    expect(normalized.data).not.toHaveProperty("sender");
    expect(Object.keys(normalized.data)).toEqual(["kind", "repository", "issue", "eventAction"]);
  });

  it("clears retry-only issue body after success while preserving action-routing identifiers", () => {
    const compacted = compactProcessedGitHubIssuePayload({
      kind: "github_issue",
      repository: { id: "123456", fullName: "example/service" },
      issue: { id: "654321", number: 17, title: "Investigate timeout", body: "sensitive retry content", state: "open", htmlUrl: "https://github.com/example/service/issues/17", updatedAt: null },
      sender: { id: "42", login: "legacy-sender" },
      eventAction: "edited",
    });
    expect(compacted.issue.body).toBeNull();
    expect(compacted).not.toHaveProperty("sender");
    expect(compacted.repository.id).toBe("123456");
    expect(compacted.issue.id).toBe("654321");
    expect(compacted.issue.number).toBe(17);
    expect(compacted.issue.title).toBe("Investigate timeout");
  });

  it("continues to accept pre-minimization rows so deployment does not dead-letter queued legacy events", () => {
    const legacy = {
      kind: "github_issue",
      repository: { id: "123456", fullName: "example/service" },
      issue: { id: "654321", number: 17, title: "Investigate timeout", body: "x".repeat(12_000), state: "open", htmlUrl: "https://github.com/example/service/issues/17", updatedAt: null },
      sender: { id: "42", login: "maintainer" },
      eventAction: "opened",
    };
    expect(githubIssuePayloadSchema.parse(legacy)).toEqual(legacy);
    expect(compactProcessedGitHubIssuePayload(legacy)).not.toHaveProperty("sender");
  });

  it("accepts an explicit manual observation and rejects undeclared fields", () => {
    const payload = {
      kind: "manual_observation",
      sourceName: "Operations note",
      sourceAuthority: "reported",
      sourceRef: null,
      claim: "The planned restart completed.",
      observedAt: "2026-09-29T12:00:00.000Z",
      validFrom: null,
      validTo: null,
      entityId: null,
      obligationId: null,
      attributeKey: "restart.status",
      value: "completed",
      epistemicState: "reported",
      qualityState: "current",
      confidence: 70,
      supersedesObservationId: null,
    };
    expect(manualObservationPayloadSchema.safeParse(payload).success).toBe(false);
    const valid = { ...payload, epistemicState: "observed" };
    expect(manualObservationPayloadSchema.safeParse(valid).success).toBe(true);
    expect(manualObservationPayloadSchema.safeParse({ ...valid, workspaceId: 999 }).success).toBe(false);
  });
});
