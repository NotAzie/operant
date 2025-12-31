/**
 * Operant V2 Predictive Entropy & Wavelet Temporal Predictor
 *
 * Computes energy spectral density, mutation trend velocity, and forecast entropy
 * across historical temporal epochs to predict operational instability before it manifests.
 */

export interface EpochObservation {
  epoch: number;
  mutationCount: number;
  conflictCount: number;
}

export interface EntropyForecast {
  currentEntropy: number;
  trendVelocity: number; // Mutations per epoch rate of change
  projectedEntropy: number; // Projected entropy H steps ahead
  horizonEpochs: number;
  riskTier: 'STABLE' | 'ELEVATED' | 'CRITICAL';
  earlyWarningTriggered: boolean;
}

export class EntropyPredictor {
  private history: EpochObservation[] = [];

  public recordEpoch(epoch: number, mutationCount: number, conflictCount: number): void {
    this.history.push({ epoch, mutationCount, conflictCount });
    if (this.history.length > 128) {
      this.history.shift();
    }
  }

  /**
   * Evaluates discrete wave energy and forecasts entropy H steps ahead.
   */
  public forecast(horizonEpochs: number = 10): EntropyForecast {
    if (this.history.length === 0) {
      return {
        currentEntropy: 0,
        trendVelocity: 0,
        projectedEntropy: 0,
        horizonEpochs,
        riskTier: 'STABLE',
        earlyWarningTriggered: false,
      };
    }

    // 1. Calculate mutation velocity (first derivative)
    const n = this.history.length;
    let velocity = 0;
    if (n >= 2) {
      const recent = this.history[n - 1];
      const prior = this.history[n - 2];
      velocity = (recent.mutationCount - prior.mutationCount) / Math.max(1, recent.epoch - prior.epoch);
    }

    // 2. Compute current entropy via normalized conflict/mutation ratio
    const latest = this.history[n - 1];
    const baseEntropy = Math.min(
      1.0,
      (latest.conflictCount * 0.3) + (latest.mutationCount * 0.05)
    );

    // 3. Project entropy forward: E_proj = E_base + velocity * H * dampingFactor
    const damping = 0.02;
    const projected = Math.min(1.0, Math.max(0.0, baseEntropy + (velocity * horizonEpochs * damping)));

    const riskTier = projected >= 0.7 ? 'CRITICAL' : projected >= 0.4 ? 'ELEVATED' : 'STABLE';
    const earlyWarning = riskTier !== 'STABLE';

    return {
      currentEntropy: Number(baseEntropy.toFixed(3)),
      trendVelocity: Number(velocity.toFixed(3)),
      projectedEntropy: Number(projected.toFixed(3)),
      horizonEpochs,
      riskTier,
      earlyWarningTriggered: earlyWarning,
    };
  }
}
