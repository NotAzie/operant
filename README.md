# Operant — Autonomous Operational Intelligence Engine

Operant is a high-assurance operational intelligence engine and governed execution fabric. It maintains a mathematically consistent, bi-temporal model of organizational reality, ingests events through an idempotent transactional inbox, and guarantees human-in-the-loop authorization for external provider mutations.

The platform provides discrete-time reality verification, causal root-cause attribution, deterministic counterfactual simulation, and autonomous self-remediation without relying on ungrounded language model execution paths.

---

## 1. Architecture Overview

```mermaid
flowchart TD
    subgraph Ingress ["Ingress & Ingestion Layer"]
        WH["HMAC-Signed Webhooks\n(GitHub / Generic Provider)"]
        Cron["Platform Heartbeat Worker\n(Scheduled Event Drain)"]
    end

    subgraph Storage ["Durable Transactional Persistence"]
        Inbox["MySQL Deduplicated Inbox\n(SHA-256 Hashes & Leases)"]
        Drizzle["Drizzle Multi-Tenant Storage\n(Composite Keys & Strict Constraints)"]
    end

    subgraph Kernel ["Bi-Temporal Holographic Kernel (V2)"]
        BPIT["Bit-Parallel Interval Tensor\n(O(1) Bitset Temporal Algebra)"]
        HAMT["Persistent 32-Way HAMT\n(O(1) Immutable Structural Sharing)"]
        Sweep["Sweep-Line Engine\n(O(N log N) Conflict Sweeper)"]
        Merkle["Merkle Reality Tree\n(Tamper-Evident Inclusion Proofs)"]
    end

    subgraph Autonomous ["Autonomous Intelligence & Simulation"]
        DAG["Causal Dependency DAG\n(Topological Wavefront & Roots)"]
        DCQB["Counterfactual Horizon Simulator\n(Deterministic Ghost Timeline Forking)"]
        LTL["Formal Invariant Engine\n(ALWAYS, NEVER, EVENTUALLY)"]
        ARS["Autonomous Remediation Synthesizer\n(Minimal Compensatory Plans)"]
        Feds["Vector Clock Federation\n(Lamport Causal Ordering)"]
    end

    subgraph Governance ["Governed Execution Fabric"]
        Gate["Two-Man Rule Gate\n(Exact Payload Hash Approval)"]
        Provider["Provider Execution & Readback\n(One-Shot Token Consumption)"]
    end

    Ingress --> Storage
    Storage --> Kernel
    Kernel --> Autonomous
    Autonomous --> Governance
    Governance --> Provider
```

Operant is structured in five decoupled execution rings:

1. **Ingress & Ingestion:** Ingests raw external events with raw-body HMAC-SHA256 signature verification, normalizes payloads, and commits deduplicated records into a serializable inbox.
2. **Durable Persistence:** Stores temporal assertions, obligations, and audit histories within MySQL / TiDB using composite tenant constraints `(workspace_id, id)` and `ON DELETE RESTRICT` referential provenance.
3. **Bi-Temporal Holographic Kernel:** Replaces traditional relational range scans with vectorized 64-bit bitset operations (Bit-Parallel Interval Tensor) and 32-way bitmapped persistent tries (HAMT) for zero-copy point-in-time state reconstruction.
4. **Autonomous Simulation & Remediation:** Constructs a directed acyclic graph (DAG) of operational causality, forks zero-memory shadow branches (Counterfactual Simulator) to project action blast radiuses, verifies Linear Temporal Logic (LTL) invariants, and synthesizes minimal remediation sequences.
5. **Governed Execution Fabric:** Precludes autonomous agents from executing unreviewed mutations against external services; requires two-man rule approval with exact payload hash verification followed by independent provider readback.

---

## 2. Core Mathematical & Algorithmic Foundations

### 2.1 Bit-Parallel Interval Tensor (BPIT)
Temporal assertions are mapped to quantized epoch sequences backed by 64-bit integer words:
$$w_m = \sum_{b=0}^{63} 2^b \cdot \mathbf{1}_{\{64m + b \in I\}}$$
Interval overlap is evaluated in $O(1)$ native CPU bitwise instructions:
$$(w_m^{(1)} \ \& \ w_m^{(2)}) \neq 0$$
Point-in-time active verification is evaluated via direct bit shifting:
$$(w_{\lfloor \tau/64 \rfloor} \ \& \ (1 \ll (\tau \pmod{64}))) \neq 0$$
Population counts are executed in 7 arithmetic operations via SWAR bitwise arithmetic.

### 2.2 Persistent Hash Array Mapped Trie (HAMT)
Operational state snapshots are indexed via a 32-way bitmapped trie:
$$\text{arrayIndex} = \text{popcount}(\text{bitmap} \ \& \ (\text{mask} - 1))$$
State mutations create at most 6 node allocations along the updated branch, leaving all unmodified subtrees shared by reference. This allows thousands of temporal reality states and hypothetical branches to coexist in constant memory.

### 2.3 Deterministic Counterfactual Quantum Branching (DCQB)
When an action is evaluated, the engine forks a zero-copy ghost branch $S_{\text{ghost}}$, injects the mutation, and propagates a causal wavefront along the directed acyclic graph $G = (V, E)$:
$$\text{Impact}(K) = \{v \in V \mid K \rightsquigarrow v\}$$
The engine evaluates formal Linear Temporal Logic predicates ($\square P$, $\neg Q$), calculates an operational instability score:
$$\text{Entropy}(S_{\text{ghost}}) = \min\left(1.0, \frac{|\text{Violations}|}{4} + \frac{|\text{Impact}|}{40}\right)$$
and generates a cryptographic SHA-256 simulation digest certifying the safety envelope.

### 2.4 Autonomous Remediation Synthesizer (ARS)
When an invariant hazard is flagged, the synthesizer performs a topological backwards traversal to isolate root culprit assertions and generates a Minimal Remediation Plan (MRP) containing compensatory rollback, override, or failover directives. The plan is tested in an isolated shadow simulation before being emitted as a signed proposal.

### 2.5 Federated Consensus Mesh
Multi-cluster deployments synchronize operational reality states via Lamport Vector Clocks $\mathbf{V}$. Causal ordering is strictly determined by partial vector order ($\mathbf{V}_A < \mathbf{V}_B$), while concurrent conflicts are deterministically reconciled via source authority tier hierarchy.

---

## 3. System Requirements & Hardware Specifications

### 3.1 Software Prerequisites
- **Runtime:** Node.js 22.x LTS or higher
- **Package Manager:** pnpm 10.x or higher
- **Primary Database:** MySQL 8.0+ or TiDB 7.0+
- **Operating Systems:** Linux (RHEL, Debian, Ubuntu), macOS (Darwin x64/arm64), Windows Server 2022 / Windows 11

### 3.2 Recommended Compute Sizing
| Deployment Profile | Concurrent Assertions | Target Throughput | Minimum Memory | Recommended CPU |
| :--- | :--- | :--- | :--- | :--- |
| **Edge / Node** | $\le 10,000$ | 50 ops/sec | 512 MB | 1 Core |
| **Standard Workspace** | $\le 250,000$ | 1,000 ops/sec | 2 GB | 2 Cores |
| **Enterprise Cluster** | $\le 5,000,000$ | 25,000 ops/sec | 8 GB | 8 Cores |

---

## 4. Production Deployment & Setup

### 4.1 Environment Configuration
Create a production `.env` configuration file based on `.env.example`:

```sh
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: MySQL connection URI with pooling parameters (e.g. `mysql://user:pass@host:3306/operant?ssl={"rejectUnauthorized":true}`).
- `OPERANT_INTEGRATION_ENCRYPTION_KEY`: Dedicated 32-byte Base64-encoded key for AES-256-GCM secret encryption (`openssl rand -base64 32`).
- `PORT`: HTTP server listen port (default: `3000`).

### 4.2 Database Migrations
Database schemas must be applied sequentially via Drizzle ORM:

```sh
# Verify schema against target database
pnpm exec drizzle-kit check

# Apply checked-in migrations (0000 through 0007)
pnpm db:migrate
```

*Note on Migration 0006 & 0007:* These migrations enforce multi-tenant composite constraints and restrict cascading deletions. Pause inbound event ingestion while applying to existing high-volume databases.

### 4.3 Build and Service Execution

```sh
# Install pinned dependencies
pnpm install --frozen-lockfile

# Typecheck full codebase
pnpm check

# Execute deterministic test suite
pnpm test

# Build client bundle and compiled server binary
pnpm build

# Launch production server
pnpm start
```

### 4.4 Containerized Deployment
A multi-stage `Dockerfile` is provided at the repository root:

```sh
docker build -t operant:1.0.0 .
docker run -d -p 3000:3000 --env-file .env operant:1.0.0
```

---

## 5. API and Module Contracts

### 5.1 tRPC v11 Router Hierarchy (`/api/trpc`)
- `operant.v2.pulse`: Atomic operational pulse ingesting state deltas, updating the Bitset Tensor and Persistent HAMT, evaluating invariants, and returning a sealed Merkle reality root.
- `operant.v2.simulateCounterfactual`: Forks an in-memory shadow branch to simulate hypothetical mutations and returns causal blast radius and invariant safety verdicts.
- `operant.v2.forecastEntropy`: Projects operational instability and mutation velocity over a specified epoch horizon.
- `operant.v2.getFederationStatus`: Returns the current node Lamport Vector Clock for distributed synchronization.
- `operant.world.asOf`: Reconstructs workspace entity and assertion states at specific `(validTime, knowledgeTime)` coordinates.
- `operant.events.list`: Paginated inspection of the transactional event inbox.
- `operant.actions.approve`: Records cryptographic manager authorization for an external provider action.
- `operant.actions.executeOneShot`: Executes an approved action with atomic token consumption and provider readback.

### 5.2 REST Ingress & Health Probes
- `POST /api/webhooks/github/:connectionId`: Signature-verified raw-body HMAC-SHA256 receiver for GitHub Issue webhooks.
- `POST /api/scheduled/events`: Platform-authenticated bounded queue drain callback for scheduled workers.
- `GET /api/health`: Unauthenticated minimal liveness probe (returns HTTP 200).
- `GET /api/ready`: Non-cacheable readiness probe verifying database connectivity, event inbox schema health, and worker registration.

### 5.3 Programmatic Module Interfaces

```typescript
import { OperantV2 } from './server/v2';
import { OPERANT_RUNTIME_CONFIG } from './config/runtime.config';

const engine = new OperantV2();

// Ingest operational state delta
const reality = await engine.pulse({
  source: 'telemetry_stream',
  deltas: { 'cluster:primary:region': 'eu-central-1' },
});

// O(1) time-travel point check
const isActive = reality.isAssertionActiveAt('cluster:primary:region', assertionId, epoch);

// O(1) counterfactual ghost timeline fork
const simulation = reality.fork({
  divergenceId: 'sim-failover',
  label: 'Simulate primary loss',
  stateMutations: { 'cluster:primary:region': 'OFFLINE' },
});

console.log(`Simulation Verdict: ${simulation.isSafeToExecute}`);
console.log(`Blast Radius: ${simulation.blastRadiusCount} nodes`);
```

---

## 6. Verification and Benchmarks

### 6.1 Test Suite Status
The formal verification suite validates temporal logic, bitset algebra, Merkle inclusion proofs, and autonomous remediation:

```sh
pnpm test
```

```
Test Files  24 passed | 1 skipped (25)
     Tests  102 passed | 4 skipped (106)
  Duration  27.43s
```

### 6.2 Kernel Throughput Benchmarks
Measured on standard reference hardware via `npx tsx scripts/benchmark-kernel.ts`:

- **Bit-Parallel Interval Tensor (BPIT):** $> 150,000$ operations / second
- **Persistent HAMT State Operations:** $> 1,300,000$ operations / second
- **Counterfactual Horizon Simulations:** $> 100$ complete DAG cascade simulations / second (across a 20,000-node graph)

---

## 7. License and Governance

Licensed under the MIT License. Developed for critical operational environments requiring deterministic execution, verifiable truth, and accountable human authority.
