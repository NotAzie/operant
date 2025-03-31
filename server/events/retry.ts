const INITIAL_RETRY_CEILING_SECONDS = 15;
const MAX_RETRY_CEILING_SECONDS = 3600;
const MAX_EXPONENT = 8;

/**
 * Full-jitter exponential backoff: sample uniformly from [1 second, capped ceiling].
 * The 1-second floor prevents an immediate hot loop; callers should also avoid
 * reclaiming the same event more than once during a single drain invocation.
 */
export function retryDelaySeconds(attemptCount: number, random: () => number = Math.random): number {
  const normalizedAttempt = Number.isFinite(attemptCount) ? Math.max(1, Math.floor(attemptCount)) : 1;
  const exponent = Math.min(normalizedAttempt - 1, MAX_EXPONENT);
  const ceiling = Math.min(MAX_RETRY_CEILING_SECONDS, INITIAL_RETRY_CEILING_SECONDS * 2 ** exponent);
  const sample = random();
  const unit = Number.isFinite(sample) ? Math.max(0, Math.min(sample, 0.999999999999)) : 0.5;
  return Math.min(ceiling, Math.max(1, Math.floor(unit * ceiling) + 1));
}
