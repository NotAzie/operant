/**
 * Operant Causal Dependency DAG Engine
 *
 * Implements a directed acyclic graph resolving causal dependencies between
 * external provider events, raw evidence, temporal assertions, obligations,
 * and authorized actions.
 *
 * Provides Kahn's algorithm topological sorting, cycle fault isolation,
 * root-cause attribution tracing, and downstream impact projection.
 */

export type CausalNodeType =
  | 'EVENT'
  | 'EVIDENCE'
  | 'ASSERTION'
  | 'OBLIGATION'
  | 'ACTION'
  | 'POLICY';

export type CausalRelationType =
  | 'CAUSES'
  | 'DERIVES_FROM'
  | 'JUSTIFIES'
  | 'TRIGGERED_BY'
  | 'SUPERSEDES';

export interface CausalNode {
  id: string;
  type: CausalNodeType;
  label: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CausalEdge {
  from: string;
  to: string;
  relation: CausalRelationType;
}

export interface TopologicalSortResult {
  sorted: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

export class CausalGraph {
  private nodes: Map<string, CausalNode> = new Map();
  private adjacency: Map<string, Set<string>> = new Map();
  private reverseAdjacency: Map<string, Set<string>> = new Map();
  private edges: CausalEdge[] = [];

  public addNode(node: CausalNode): void {
    if (!this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      this.adjacency.set(node.id, new Set());
      this.reverseAdjacency.set(node.id, new Set());
    }
  }

  public addEdge(from: string, to: string, relation: CausalRelationType): void {
    if (!this.nodes.has(from) || !this.nodes.has(to)) {
      throw new Error(`Cannot add edge: node '${!this.nodes.has(from) ? from : to}' does not exist.`);
    }
    this.adjacency.get(from)!.add(to);
    this.reverseAdjacency.get(to)!.add(from);
    this.edges.push({ from, to, relation });
  }

  public getNode(id: string): CausalNode | undefined {
    return this.nodes.get(id);
  }

  public getNodeCount(): number {
    return this.nodes.size;
  }

  public getEdgeCount(): number {
    return this.edges.length;
  }

  /**
   * Kahn's Algorithm for Topological Sorting & Cycle Detection
   * Complexity: O(V + E)
   */
  public topologicalSort(): TopologicalSortResult {
    const inDegree = new Map<string, number>();
    for (const [id] of this.nodes) {
      inDegree.set(id, 0);
    }
    for (const edge of this.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const neighbors = this.adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        const nextDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, nextDeg);
        if (nextDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (sorted.length !== this.nodes.size) {
      const cycleNodes = Array.from(this.nodes.keys()).filter((id) => !sorted.includes(id));
      return {
        sorted: [],
        hasCycle: true,
        cycleNodes,
      };
    }

    return {
      sorted,
      hasCycle: false,
    };
  }

  /**
   * Backwards causal traversal: finds all upstream ancestors contributing to target node
   */
  public traceRootCauses(targetId: string): CausalNode[] {
    if (!this.nodes.has(targetId)) return [];

    const visited = new Set<string>();
    const queue = [targetId];
    const rootCauses: CausalNode[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const parents = this.reverseAdjacency.get(current) || new Set();

      if (parents.size === 0 && current !== targetId) {
        const n = this.nodes.get(current);
        if (n) rootCauses.push(n);
      }

      for (const parent of parents) {
        if (!visited.has(parent)) {
          visited.add(parent);
          queue.push(parent);
        }
      }
    }

    return rootCauses;
  }

  /**
   * Forwards causal projection: finds all downstream descendants affected by target node
   */
  public traceDownstreamImpact(targetId: string): CausalNode[] {
    if (!this.nodes.has(targetId)) return [];

    const visited = new Set<string>();
    const queue = [targetId];
    const impactList: CausalNode[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = this.adjacency.get(current) || new Set();

      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
          const n = this.nodes.get(child);
          if (n) impactList.push(n);
        }
      }
    }

    return impactList;
  }

  /**
   * Export graph as a clean Mermaid diagram
   */
  public toMermaid(): string {
    const lines = ['flowchart TD'];
    for (const [id, node] of this.nodes) {
      const cleanLabel = node.label.replace(/"/g, "'");
      lines.push(`  ${id}["[${node.type}] ${cleanLabel}"]`);
    }
    for (const edge of this.edges) {
      lines.push(`  ${edge.from} -->|${edge.relation}| ${edge.to}`);
    }
    return lines.join('\n');
  }
}
