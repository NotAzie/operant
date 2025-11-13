/**
 * Operant Hexagonal Architecture Ports & Core Domain Contracts
 *
 * Defines strictly typed, decoupled interfaces between the pure domain kernel
 * and external infrastructural adapters (persistence, identity, event mesh,
 * provider clients, and LLM inference).
 */

import type { TemporalInterval, SweepConflict } from '../domain/sweepLine';
import type { MerkleProofElement } from '../domain/merkle';
import type { CausalGraph, CausalNode, CausalEdge } from '../domain/causality';

export interface WorkspaceContext {
  workspaceId: string | number;
  userId: string | number;
  role: 'admin' | 'operator' | 'viewer';
}

export interface IOperationalRepository {
  getAssertionById(workspaceId: string | number, id: string | number): Promise<TemporalInterval | null>;
  listActiveAssertions(workspaceId: string | number, asOfTimestamp: number): Promise<TemporalInterval[]>;
  persistAssertion(workspaceId: string | number, assertion: TemporalInterval): Promise<{ id: string | number }>;
  recordAuditSnapshot(workspaceId: string | number, recordType: string, recordId: string | number, payload: unknown): Promise<void>;
}

export interface IEventInbox {
  enqueue(workspaceId: string | number, eventType: string, payload: unknown, idempotencyKey: string): Promise<string>;
  claimBatch(workerId: string, batchSize: number, leaseSeconds: number): Promise<Array<{ id: string; payload: unknown }>>;
  acknowledge(id: string, resultStatus: 'SUCCESS' | 'DEAD_LETTER', errorDetail?: string): Promise<void>;
}

export interface IConflictDetector {
  detectConflicts(intervals: TemporalInterval[]): SweepConflict[];
}

export interface IAuditIntegrityEngine {
  computeWorkspaceRoot(workspaceId: string | number): Promise<string>;
  generateProof(workspaceId: string | number, assertionId: string | number): Promise<MerkleProofElement[]>;
  verifyProof(leafHash: string, proof: MerkleProofElement[], expectedRoot: string): boolean;
}

export interface ICausalityEngine {
  buildWorkspaceGraph(workspaceId: string | number): Promise<CausalGraph>;
  traceRootCauses(workspaceId: string | number, targetId: string): Promise<CausalNode[]>;
}

export interface IProviderAdapter {
  providerName: string;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string, secret: string): boolean;
  executeApprovedAction(actionId: string, payloadHash: string, payload: unknown): Promise<{ providerReference: string }>;
  readbackVerification(providerReference: string): Promise<{ confirmed: boolean; state: unknown }>;
}
