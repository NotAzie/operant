import { describe, expect, it } from "vitest";
import { findReasoningContextOverflows, REASONING_CONTEXT_LIMITS, type ReasoningContextCounts } from "./completeness";

const countsAtLimits = (): ReasoningContextCounts => ({ ...REASONING_CONTEXT_LIMITS });

describe("reasoning snapshot completeness gate", () => {
  it("accepts a snapshot exactly at every configured limit", () => {
    expect(findReasoningContextOverflows(countsAtLimits())).toEqual([]);
  });

  it("rejects the first row beyond a configured limit", () => {
    expect(findReasoningContextOverflows({ ...countsAtLimits(), observations: REASONING_CONTEXT_LIMITS.observations + 1 }))
      .toEqual([{ collection: "observations", maximum: REASONING_CONTEXT_LIMITS.observations }]);
  });

  it("reports every overflowing collection deterministically", () => {
    expect(findReasoningContextOverflows({ ...countsAtLimits(), evidence: 101, resources: 101 }))
      .toEqual([{ collection: "evidence", maximum: REASONING_CONTEXT_LIMITS.evidence }, { collection: "resources", maximum: REASONING_CONTEXT_LIMITS.resources }]);
  });
});
