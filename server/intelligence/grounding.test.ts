import { describe, expect, it } from "vitest";
import { validateGroundedOutput } from "./grounding";

const validOutput = {
  summary: "Two sources disagree about the issue state.",
  conclusions: [{ text: "The issue may be closed, but current evidence conflicts.", epistemicState: "inferred", evidenceIds: [11, 12], confidence: 55, uncertainty: "The sources have not been reconciled." }],
  recommendations: [{ text: "Review the source conflict before changing state.", evidenceIds: [11], objectiveIds: [3], constraints: ["No automatic resolution."] }],
  uncertainties: ["A fresh provider read is not yet available."],
};

describe("grounded model output", () => {
  it("accepts a strict structured result whose evidence and objectives are in the retrieved context", () => {
    expect(validateGroundedOutput(validOutput, new Set([11, 12]), new Set([3]))).toMatchObject({ ok: true });
  });

  it("rejects a conclusion citing evidence outside the supplied workspace snapshot", () => {
    const candidate = { ...validOutput, conclusions: [{ ...validOutput.conclusions[0], evidenceIds: [999] }] };
    expect(validateGroundedOutput(candidate, new Set([11, 12]), new Set([3]))).toMatchObject({ ok: false, reason: "unsupported_evidence" });
  });

  it("rejects a recommendation citing an unavailable objective", () => {
    const candidate = { ...validOutput, recommendations: [{ ...validOutput.recommendations[0], objectiveIds: [404] }] };
    expect(validateGroundedOutput(candidate, new Set([11, 12]), new Set([3]))).toMatchObject({ ok: false, reason: "unsupported_objective" });
  });

  it("requires evidence support on each conclusion and recommendation and rejects extra fields", () => {
    const unsupported = { ...validOutput, recommendations: [{ ...validOutput.recommendations[0], evidenceIds: [] }] };
    expect(validateGroundedOutput(unsupported, new Set([11, 12]), new Set([3]))).toMatchObject({ ok: false, reason: "invalid_shape" });
    expect(validateGroundedOutput({ ...validOutput, hiddenReasoning: "not part of the contract" }, new Set([11, 12]), new Set([3]))).toMatchObject({ ok: false, reason: "invalid_shape" });
  });
});
