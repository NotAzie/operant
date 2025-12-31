import { describe, expect, it } from 'vitest';
import { EntropyPredictor } from './entropyPredictor';

describe('EntropyPredictor (Wavelet Predictive Engine)', () => {
  it('forecasts stable entropy when operational mutations are low and steady', () => {
    const predictor = new EntropyPredictor();
    predictor.recordEpoch(1, 2, 0);
    predictor.recordEpoch(2, 2, 0);
    predictor.recordEpoch(3, 2, 0);

    const forecast = predictor.forecast(10);
    expect(forecast.riskTier).toBe('STABLE');
    expect(forecast.earlyWarningTriggered).toBe(false);
    expect(forecast.projectedEntropy).toBeLessThan(0.4);
  });

  it('triggers early warning when mutation velocity and conflicts accelerate', () => {
    const predictor = new EntropyPredictor();
    predictor.recordEpoch(1, 5, 0);
    predictor.recordEpoch(2, 25, 2);
    predictor.recordEpoch(3, 75, 5);

    const forecast = predictor.forecast(10);
    expect(forecast.trendVelocity).toBeGreaterThan(0);
    expect(forecast.riskTier).toBe('CRITICAL');
    expect(forecast.earlyWarningTriggered).toBe(true);
    expect(forecast.projectedEntropy).toBeGreaterThanOrEqual(0.7);
  });
});
