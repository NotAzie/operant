import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { GitFork, ShieldAlert, ShieldCheck, Zap, Activity } from 'lucide-react';

interface CounterfactualSimulatorPanelProps {
  workspaceId: string | number;
}

export function CounterfactualSimulatorPanel({ workspaceId }: CounterfactualSimulatorPanelProps) {
  const [divergenceKey, setDivergenceKey] = useState('cluster:primary:region');
  const [hypotheticalVal, setHypotheticalVal] = useState('eu-central-1');
  const [simulationResult, setSimulationResult] = useState<{
    divergenceId: string;
    blastRadiusCount: number;
    affectedKeys: string[];
    violations: Array<{ invariantName: string; description: string }>;
    entropyScore: number;
    isSafeToExecute: boolean;
    simulationWitnessHash: string;
  } | null>(null);

  const [isRunning, setIsRunning] = useState(false);

  const simulateMutation = trpc.operant.v2.simulateCounterfactual.useMutation();

  const handleSimulate = async () => {
    setIsRunning(true);
    try {
      const res = await simulateMutation.mutateAsync({
        workspaceId,
        divergenceId: `sim-${Date.now()}`,
        label: `Simulate ${divergenceKey} -> ${hypotheticalVal}`,
        stateMutations: {
          [divergenceKey]: hypotheticalVal,
        },
      });
      setSimulationResult(res);
    } catch (err) {
      console.error('Counterfactual simulation failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="border-[#AFC7B7]/40 bg-[#F5F3EC]/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitFork className="h-5 w-5 text-[#153C36]" />
            <CardTitle className="text-base font-semibold text-[#153C36]">
              Counterfactual Horizon Simulator (V2)
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-[#153C36] text-[#153C36] text-xs font-mono">
            O(1) HAMT-DAG Quantum Branching
          </Badge>
        </div>
        <CardDescription className="text-xs text-[#202923]/70">
          Simulate hypothetical mutations along an isolated ghost branch before committing actions to consensus reality.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[#202923]">Target Assertion Key</label>
            <Input
              value={divergenceKey}
              onChange={(e) => setDivergenceKey(e.target.value)}
              className="mt-1 text-xs font-mono bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#202923]">Hypothetical Value</label>
            <Input
              value={hypotheticalVal}
              onChange={(e) => setHypotheticalVal(e.target.value)}
              className="mt-1 text-xs font-mono bg-white"
            />
          </div>
        </div>

        <Button
          onClick={handleSimulate}
          disabled={isRunning}
          className="w-full bg-[#153C36] hover:bg-[#153C36]/90 text-white text-xs h-8 font-medium"
        >
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          {isRunning ? 'Projecting Causal Wavefront...' : 'Simulate Counterfactual Trajectory'}
        </Button>

        {simulationResult && (
          <div className="mt-3 p-3 rounded border border-[#AFC7B7] bg-white space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[#202923]/70">Safety Verdict:</span>
              {simulationResult.isSafeToExecute ? (
                <span className="flex items-center text-emerald-700 font-semibold gap-1">
                  <ShieldCheck className="h-4 w-4" /> SAFE TO COMMIT
                </span>
              ) : (
                <span className="flex items-center text-rose-700 font-semibold gap-1">
                  <ShieldAlert className="h-4 w-4" /> INVARIANT HAZARD DETECTED
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-[#202923]/70 block">Causal Blast Radius:</span>
                <span className="text-sm font-bold text-[#153C36]">
                  {simulationResult.blastRadiusCount} affected nodes
                </span>
              </div>
              <div>
                <span className="text-[#202923]/70 block">Entropy Instability:</span>
                <span className="text-sm font-bold text-[#B77D3D] flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" /> {simulationResult.entropyScore}
                </span>
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[#202923]/70 block">Simulation Witness Hash:</span>
              <span className="text-[10px] text-gray-500 break-all">
                {simulationResult.simulationWitnessHash}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
