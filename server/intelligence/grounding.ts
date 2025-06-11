import { z } from "zod";

export const groundedOutputSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  conclusions: z.array(z.object({
    text: z.string().trim().min(1).max(700),
    epistemicState: z.enum(["inferred", "predicted"]),
    evidenceIds: z.array(z.number().int().positive()).min(1).max(20),
    confidence: z.number().int().min(0).max(100),
    uncertainty: z.string().max(500).nullable(),
  }).strict()).max(12),
  recommendations: z.array(z.object({
    text: z.string().trim().min(1).max(700),
    evidenceIds: z.array(z.number().int().positive()).min(1).max(20),
    objectiveIds: z.array(z.number().int().positive()).max(10),
    constraints: z.array(z.string().max(300)).max(10),
  }).strict()).max(8),
  uncertainties: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict();

export type GroundedOutput = z.infer<typeof groundedOutputSchema>;

export type GroundingResult =
  | { ok: true; value: GroundedOutput }
  | { ok: false; reason: "invalid_shape" | "unsupported_evidence" | "unsupported_objective"; detail: string };

export function validateGroundedOutput(
  candidate: unknown,
  allowedEvidenceIds: ReadonlySet<number>,
  allowedObjectiveIds: ReadonlySet<number>,
): GroundingResult {
  const parsed = groundedOutputSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: "invalid_shape", detail: parsed.error.issues[0]?.message ?? "Output did not match the required structure." };
  for (const conclusion of parsed.data.conclusions) {
    if (conclusion.evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
      return { ok: false, reason: "unsupported_evidence", detail: "A conclusion referenced evidence outside the retrieved workspace context." };
    }
  }
  for (const recommendation of parsed.data.recommendations) {
    if (recommendation.evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
      return { ok: false, reason: "unsupported_evidence", detail: "A recommendation referenced evidence outside the retrieved workspace context." };
    }
    if (recommendation.objectiveIds.some((id) => !allowedObjectiveIds.has(id))) {
      return { ok: false, reason: "unsupported_objective", detail: "A recommendation referenced an objective outside the workspace context." };
    }
  }
  return { ok: true, value: parsed.data };
}

export const GROUNDED_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    conclusions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      text: { type: "string" }, epistemicState: { type: "string", enum: ["inferred", "predicted"] },
      evidenceIds: { type: "array", minItems: 1, items: { type: "integer" } }, confidence: { type: "integer", minimum: 0, maximum: 100 }, uncertainty: { type: ["string", "null"] },
    }, required: ["text", "epistemicState", "evidenceIds", "confidence", "uncertainty"] } },
    recommendations: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      text: { type: "string" }, evidenceIds: { type: "array", minItems: 1, items: { type: "integer" } }, objectiveIds: { type: "array", items: { type: "integer" } }, constraints: { type: "array", items: { type: "string" } },
    }, required: ["text", "evidenceIds", "objectiveIds", "constraints"] } },
    uncertainties: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "conclusions", "recommendations", "uncertainties"],
} as const;
