export const REASONING_CONTEXT_LIMITS = {
  entities: 50,
  evidence: 100,
  observations: 150,
  obligations: 75,
  objectives: 50,
  policies: 100,
  conflicts: 50,
  resources: 100,
  versions: 200,
  allocations: 300,
  responsibilities: 300,
} as const;

export type ReasoningContextCounts = { [K in keyof typeof REASONING_CONTEXT_LIMITS]: number };
export type ReasoningContextOverflow = { collection: keyof typeof REASONING_CONTEXT_LIMITS; maximum: number };

export function findReasoningContextOverflows(counts: ReasoningContextCounts): ReasoningContextOverflow[] {
  const limits = Object.entries(REASONING_CONTEXT_LIMITS) as Array<[keyof typeof REASONING_CONTEXT_LIMITS, number]>;
  return limits.flatMap(([collection, maximum]) => counts[collection] > maximum ? [{ collection, maximum }] : []);
}
