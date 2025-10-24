import { describe, expect, it } from 'vitest';
import { CausalGraph } from './causality';

describe('CausalGraph', () => {
  it('correctly constructs graph and performs topological sorting via Kahn algorithm', () => {
    const graph = new CausalGraph();

    graph.addNode({ id: 'ev-1', type: 'EVENT', label: 'GitHub Issue #42 Opened', timestamp: 1000 });
    graph.addNode({ id: 'evi-1', type: 'EVIDENCE', label: 'Raw issue body text', timestamp: 1010 });
    graph.addNode({ id: 'assert-1', type: 'ASSERTION', label: 'Bug reported on auth service', timestamp: 1020 });
    graph.addNode({ id: 'ob-1', type: 'OBLIGATION', label: 'Triage within 4h SLA', timestamp: 1030 });
    graph.addNode({ id: 'act-1', type: 'ACTION', label: 'Post comment acknowledging triage', timestamp: 1040 });

    graph.addEdge('ev-1', 'evi-1', 'DERIVES_FROM');
    graph.addEdge('evi-1', 'assert-1', 'JUSTIFIES');
    graph.addEdge('assert-1', 'ob-1', 'TRIGGERED_BY');
    graph.addEdge('ob-1', 'act-1', 'CAUSES');

    expect(graph.getNodeCount()).toBe(5);
    expect(graph.getEdgeCount()).toBe(4);

    const sortRes = graph.topologicalSort();
    expect(sortRes.hasCycle).toBe(false);
    expect(sortRes.sorted).toEqual(['ev-1', 'evi-1', 'assert-1', 'ob-1', 'act-1']);
  });

  it('detects cycles and isolates cycle nodes', () => {
    const graph = new CausalGraph();
    graph.addNode({ id: 'A', type: 'ASSERTION', label: 'Node A', timestamp: 100 });
    graph.addNode({ id: 'B', type: 'ASSERTION', label: 'Node B', timestamp: 200 });
    graph.addNode({ id: 'C', type: 'ASSERTION', label: 'Node C', timestamp: 300 });

    graph.addEdge('A', 'B', 'CAUSES');
    graph.addEdge('B', 'C', 'CAUSES');
    graph.addEdge('C', 'A', 'CAUSES'); // Cycle!

    const sortRes = graph.topologicalSort();
    expect(sortRes.hasCycle).toBe(true);
    expect(sortRes.sorted).toEqual([]);
    expect(sortRes.cycleNodes).toEqual(expect.arrayContaining(['A', 'B', 'C']));
  });

  it('accurately traces root causes backwards from any downstream action', () => {
    const graph = new CausalGraph();
    graph.addNode({ id: 'root1', type: 'EVENT', label: 'Sensor Alert', timestamp: 100 });
    graph.addNode({ id: 'root2', type: 'EVENT', label: 'Operator Override', timestamp: 110 });
    graph.addNode({ id: 'mid', type: 'ASSERTION', label: 'Combined Incident', timestamp: 120 });
    graph.addNode({ id: 'action', type: 'ACTION', label: 'Failover Dispatched', timestamp: 130 });

    graph.addEdge('root1', 'mid', 'JUSTIFIES');
    graph.addEdge('root2', 'mid', 'JUSTIFIES');
    graph.addEdge('mid', 'action', 'CAUSES');

    const roots = graph.traceRootCauses('action');
    expect(roots).toHaveLength(2);
    const rootIds = roots.map((r) => r.id);
    expect(rootIds).toContain('root1');
    expect(rootIds).toContain('root2');
  });

  it('accurately projects downstream impact from an upstream event', () => {
    const graph = new CausalGraph();
    graph.addNode({ id: 'event', type: 'EVENT', label: 'Config change', timestamp: 100 });
    graph.addNode({ id: 'ob1', type: 'OBLIGATION', label: 'Notify team', timestamp: 110 });
    graph.addNode({ id: 'ob2', type: 'OBLIGATION', label: 'Audit logs', timestamp: 120 });

    graph.addEdge('event', 'ob1', 'TRIGGERED_BY');
    graph.addEdge('event', 'ob2', 'TRIGGERED_BY');

    const impact = graph.traceDownstreamImpact('event');
    expect(impact).toHaveLength(2);
    const impactIds = impact.map((i) => i.id);
    expect(impactIds).toContain('ob1');
    expect(impactIds).toContain('ob2');
  });

  it('generates clinical Mermaid flowchart string', () => {
    const graph = new CausalGraph();
    graph.addNode({ id: 'A', type: 'EVENT', label: 'Event Alpha', timestamp: 100 });
    graph.addNode({ id: 'B', type: 'ACTION', label: 'Action Beta', timestamp: 200 });
    graph.addEdge('A', 'B', 'CAUSES');

    const mermaid = graph.toMermaid();
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('A["[EVENT] Event Alpha"]');
    expect(mermaid).toContain('A -->|CAUSES| B');
  });
});
