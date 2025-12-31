/**
 * Operant V1.0 Platform Runtime Configuration
 *
 * Centralized operational parameters, kernel bounds, caching limits,
 * and security parameters for production deployments.
 */

export const OPERANT_RUNTIME_CONFIG = {
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT) || 3000,

  kernel: {
    bitsetTensorDefaultMaxWords: 16,
    defaultEpochDurationSeconds: 60,
    hamtBitmapWidthBits: 32,
    causalMaxTraversalDepth: 64,
  },

  cache: {
    maxEntries: 10_000,
    defaultTtlMs: 60_000,
    generationalEvictionEnabled: true,
  },

  simulation: {
    maxCounterfactualHorizonSteps: 100,
    maxBlastRadiusWarningThreshold: 25,
    entropyHazardThreshold: 0.6,
  },

  governance: {
    twoManRuleRequiredForProviders: true,
    actionPayloadHashAlgorithm: 'sha256',
    tokenOneShotTtlSeconds: 300,
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    encryptionAlgorithm: 'aes-256-gcm',
    rateLimitMaxRequestsPerMinute: 600,
  },
} as const;
