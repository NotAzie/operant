/**
 * Operant V2 Radical Single-Op tRPC Router
 *
 * Exposes the next-generation pulse paradigm, bit-parallel time-travel checks,
 * and deterministic counterfactual quantum branching to client workspaces.
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { OperantV2 } from './core/operantV2';

// Workspace-scoped global singleton engine
const engine = new OperantV2();

export const operantV2Router = router({
  pulse: protectedProcedure
    .input(
      z.object({
        workspaceId: z.union([z.string(), z.number()]),
        source: z.string(),
        deltas: z.record(z.string(), z.unknown()),
        startEpoch: z.number().optional(),
        endEpoch: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const reality = await engine.pulse({
        source: input.source,
        deltas: input.deltas,
        validEpoch: input.startEpoch !== undefined ? {
          startEpoch: input.startEpoch,
          endEpoch: input.endEpoch ?? null,
        } : undefined,
      });

      return {
        timestamp: reality.timestamp,
        merkleRoot: reality.seal(),
        currentState: reality.exportState(),
      };
    }),

  simulateCounterfactual: protectedProcedure
    .input(
      z.object({
        workspaceId: z.union([z.string(), z.number()]),
        divergenceId: z.string(),
        label: z.string(),
        stateMutations: z.record(z.string(), z.unknown()),
        triggerAction: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const reality = await engine.pulse({
        source: 'counterfactual_anchor',
        deltas: {},
      });

      const simulation = reality.fork({
        divergenceId: input.divergenceId,
        sourceTimestamp: Date.now(),
        label: input.label,
        stateMutations: input.stateMutations,
        triggerAction: input.triggerAction,
      });

      return simulation;
    }),
});
