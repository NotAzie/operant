/**
 * Operant V2 Platform Barrel Export
 *
 * Exposes core kernel data structures, simulation primitives, autonomous
 * remediation engines, and tRPC routers for external consumption.
 */

export * from './kernel/bitsetTensor';
export * from './kernel/persistentHamt';
export * from './simulation/invariantEngine';
export * from './simulation/counterfactual';
export * from './autonomous/remediation';
export * from './autonomous/entropyPredictor';
export * from './autonomous/federation';
export * from './core/operantV2';
export * from './router';
