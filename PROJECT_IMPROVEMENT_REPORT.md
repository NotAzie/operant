# Operant — Full Engineering Audit & Improvement Report

**Audit date:** 2026-10-07  
**Project:** Operant — Level 3 Operational Intelligence  
**Scope:** 13 independent engineering domains; read-only source, test, configuration, and documentation review  
**Status:** Baseline audit synthesized; highest-priority implementation focus selected and underway. This is an evolving engineering record, not a declaration that the product is hardened or complete.

## 1. Product purpose and long-term vision

Operant is intended to be an operational-intelligence system that helps teams maintain an auditable representation of reality and use it safely. Its defining capabilities are:

1. **Evidence-backed world state:** assertions have provenance, uncertainty, source identity, and explicit correction/conflict handling.
2. **Temporal reconstruction:** distinguish when a fact was true in the world (**valid time**) from when Operant learned or recorded it (**knowledge/transaction time**).
3. **Durable ingestion:** accept external events idempotently, preserve a recoverable processing ledger, and make delayed or failed work visible.
4. **Grounded reasoning:** generate advisory conclusions from bounded, current, cited context; never let the model silently invent evidence or authorize writes.
5. **Governed actions:** keep proposals, approvals of exact payloads, execution, and provider-side verification separate and auditable.
6. **Strict workspace isolation:** enforce authorization at the API boundary and reinforce referential isolation in the database.

The central architectural test is not whether a request succeeds. It is whether a later investigator can reproduce what Operant believed, what evidence supported that belief, what changed, who authorized an external action, and what the external provider actually confirmed.

## 2. Audit method and confidence boundaries

- Thirteen dedicated read-only reviewers examined separate domains and returned structured findings. The domains are each represented below.
- The workflow’s separate synthesis step failed twice before emitting a report. This document is synthesized from the retained domain results; the failure is recorded here rather than hidden.
- Reviewers inspected the current working tree, source, tests, README, engineering report, and backlog. No files were edited during the audit stage.
- The repository was already dirty before the audit. Findings describe the current checkout; they are not attributed to a clean commit or diff baseline.
- No production database, secret, live GitHub connection, browser, external monitoring system, or provider API was accessed. No tests, build, migration, benchmark, query plan, load test, or accessibility session was run as part of the read-only audit.
- The report’s earlier validation figures (57 passed, 3 skipped) are historical documentation, not fresh test evidence. The audit found 60 declared test cases in the current source inventory; that count is not a test run.
- Performance risks are source-level hypotheses. No latency, memory, CPU/GPU, transfer-size, or scale result is claimed as measured.
- “Not applicable” is used where the repository has no corresponding workload. In particular, no local GPU/CUDA or canvas/WebGL subsystem was found; model inference is an outbound managed HTTP request.

## 3. Executive assessment

Operant has moved well beyond a UI prototype. Strong foundations include explicit workspace roles, numerous workspace-composite foreign keys, durable event and attempt records, transactionally grouped writes, bitemporal observation selection, visible completeness guards, bounded retries with jitter, encrypted integration credentials, raw-body webhook verification, and exact-hash approval with separate provider read-back. Several difficult domain rules already live in pure functions with focused tests.

The system is **not yet production-hardened**. The highest product-truth risk is that resource-version history is not reconstructed consistently: a known successor currently causes its predecessor to be removed from every requested valid-time view, including time before the successor took effect. This conflicts with the product’s bitemporal promise. Additional unresolved risks include null `validFrom` semantics, partial historical coverage, cross-workspace source-event references not protected by composite constraints, mixed-time multi-query reasoning snapshots, silent list truncation, insufficient integration/race tests, claim fencing without a unique generation, recovery-worker readiness semantics, session revocation and retention gaps, and no repository CI evidence.

The recommended direction is **incremental convergence on explicit temporal and authority contracts**, not a wholesale rewrite:

- fix the confirmed historical-version selection defect in a pure shared domain helper first;
- use one completeness-aware query/application boundary for World Model and Intelligence;
- add snapshot-consistency and pagination contracts before raising row limits;
- strengthen session, provenance, and action authorization lifecycle controls;
- validate database concurrency and governed provider flows using a disposable TiDB-compatible environment;
- add safe operational signals and CI once their platform ownership and delivery path are known.

## 4. Ranked engineering domains

The ranking prioritizes impact on Operant’s truth, tenant safety, governed actions, and ability to detect failure. It is not a claim that performance impacts have been measured.

| Rank | Domain | Priority | Why it ranks here |
|---:|---|---|---|
| 1 | Data model, temporal correctness, tenant isolation | P1 | Historical reconstruction is a core product guarantee; concrete valid-time gaps can produce a wrong past state. |
| 2 | Application security, authorization, privacy | P1 | Long-lived sessions, retention, access to action drafts, and audit tamper resistance affect account and operational-data exposure. |
| 3 | Reliability, failure handling, recovery | P1 | Queue durability is a product promise, but claim fencing and worker health are not yet fully demonstrated. |
| 4 | Backend APIs, algorithms, data structures, edge cases | P1 | Mixed-time snapshots and hidden list truncation can mislead reasoning and operators. |
| 5 | Testing and verification confidence | P1 | Current unit tests do not prove the persisted, concurrent, cross-layer action and tenant guarantees. |
| 6 | Logging, monitoring, operational signals | P1 | Storage readiness and worker registration are not equivalent to a healthy, timely processing pipeline. |
| 7 | Architecture, structure, maintainability, extensibility | P1 | Route handlers own too much application and persistence policy; context assembly is duplicated. |
| 8 | Backend scalability and resource performance | P1 | Workspace-wide reads, serial queue processing, and fixed caps create future workload ceilings; impact remains unmeasured. |
| 9 | Deployment, runtime configuration, portability | P1 | Production worker activation, configuration validation, shutdown, and rollout practices depend heavily on operator knowledge. |
| 10 | UX, accessibility, responsive/cross-platform behavior | P1 | Mobile sign-out, zoom, small text, and unannounced state changes affect access to safety-critical review workflows. |
| 11 | Documentation and developer experience | P1 | Migration, DB compatibility, and readiness wording can lead to unsafe assumptions or stalled onboarding. |
| 12 | Frontend rendering and delivery performance | P2 | Route splitting and request batching exist, but default refetch, whole-list rendering, and asset policy are not measured or explicit. |
| 13 | Build, dependencies, supply-chain hygiene | P2 | Pinned package management is positive; CI, dependency advisory automation, and a lean immutable runtime image are absent from the inspected tree. |

## 5. Domain findings

### 5.1 Data model, temporal correctness, and tenant isolation — Rank 1, P1

**Current state.** Operant stores observations and evidence with observed, recorded, and valid timestamps; supports point-in-time reconstruction; retains selected audit snapshots; and uses workspace-composite constraints for many important links. The observation selector correctly separates knowledge-time cutoffs from valid-time intervals and handles provider streams by source-effective time. However, temporal behavior differs across record types, and some integrity boundaries remain application-only.

**Strengths.** Half-open `[validFrom, validTo)` semantics are tested for observations. Provider updates are ordered by effective time rather than arrival order; independent connections and same-time conflicts remain visible. Several high-value writes include event/audit records in the same transaction. Migration 0006 adds many workspace-composite foreign keys.

**Weaknesses and risks.** In the World Model, a resource version is filtered out as soon as any known successor points to it, rather than remaining effective before the successor’s `validFrom`. Thus a query for a historically earlier valid time can omit the state that was true then. Separately, an omitted observation `validFrom` is treated as unbounded in the past. Evidence/observation `sourceEventId` references are single-column FKs rather than workspace-composite links. Some mutable descriptive fields do not retain enough history for complete as-of reconstruction. Database constraints do not yet enforce all validity/numeric rules.

**Why it matters / long-term impact.** Temporal errors can create plausible but false historical answers even when every workspace predicate is correct. Once dependent reasoning and audit records accumulate, correcting missing or misinterpreted history may require backfills and qualification of past results. Composite write constraints cannot replace authorization for reads, but they can prevent bad provenance links from becoming durable.

**Recommendations.** Immediately preserve superseded resource versions up to the effective start of a known successor. Then define `validFrom`-null semantics; add a history-coverage matrix; extend workspace-composite provenance constraints where the target TiDB supports them; and test the actual DB engine. Longer term, consider explicit temporal-stream metadata and typed immutable versions rather than inferring all stream behavior from provider/evidence fields.

**Difficulty / benefit.** Focused interval selection: low-to-medium difficulty, high benefit, no schema migration required. Full temporal-contract normalization and historical coverage: medium-to-high difficulty, very high long-term benefit.

**Evidence.** `server/domain/router.ts:88–111` (resource-version reconstruction), `server/domain/temporal.ts:108–192` (observation intervals and provider streams), `drizzle/schema.ts:73–125` and `drizzle/0004_operant_level3_operational_model.sql:336–337` (source-event references), `drizzle/0006_tenant_workspace_constraints.sql:75–123` (composite links), `server/domain/temporal.test.ts:28–113` (existing tests do not cover the flagged resource transition).

**Confidence / limits.** Medium. The selector and schema concerns are directly visible; deployed catalog behavior and intended semantics for omitted valid starts were not verified against live data. The highest-priority improvement selected from this finding is the resource-version historical interval correction.

### 5.2 Application security, authorization, and privacy — Rank 2, P1

**Current state.** The source contains project-bound JWT sessions, OAuth state nonce validation, secure HttpOnly cookies, signed double-submit CSRF, workspace role checks, AES-256-GCM integration secret encryption, raw-body HMAC verification, bounded inputs, and exact-hash GitHub approvals. High-consequence live OAuth/provider acceptance remains unverified.

**Strengths.** Crypto and webhook helpers use authenticated encryption, constant-time signature comparison, and raw bytes. Workspace mutations check membership/role, and selected relationships have composite tenant constraints. External comments have a stored payload hash, separate approval and execution, and provider read-back. Payload size and rate controls are present.

**Weaknesses and risks.** Logout clears the client cookie but the signed token has a one-year default lifetime and no evident server-side revocation. No retention/deletion schedule was found for reasoning snapshots, evidence excerpts, retries, or dead letters. Audit rows are not shown to be tamper-evident or protected from privileged DB edits. Viewers can access action attempt/evaluation detail including draft previews and provider context. The proposer/approver can be the same administrator; whether that violates intended four-eyes policy is undecided. Workspace members’ emails are visible to all viewers.

**Why it matters / long-term impact.** Credentials and operational content grow over time. Without revocation, least-privilege display, retention, and an explicit audit threat model, compromise and privacy impact increase, and accountability becomes harder to establish after external writes.

**Recommendations.** Add server-side session revocation or short-lived token lifecycle; define retention periods by data class with audit-preserving redaction; restrict attempt metadata to roles that need it; decide whether high-risk actions require proposer/approver separation; and add request-level CSRF, role-denial, tenant, and action-lifecycle tests. Avoid claiming immutable audit history until storage permissions or tamper-evidence are in place.

**Difficulty / benefit.** Medium overall; high benefit. Retention and independent-approval requirements need explicit product/operational decisions before implementation.

**Evidence.** `server/_core/sdk.ts:167–197, 200–232, 259–325` (session lifetime/auth), `server/routers.ts:10–18` (logout clears cookie), `server/integrations/github/actions.ts:122–225` (action lifecycle and attempt access), `server/drizzle/schema.ts:292–301, 364–400, 561–582` (retained inbox/reasoning/audit data), `server/operantWorkspaceRouter.ts:284–293` (member details).

**Confidence / limits.** Medium. Source controls are visible, but no exploit tests, deployed role configuration, key custody, or live OAuth/provider flow was inspected.

### 5.3 Reliability, failure handling, and recovery — Rank 3, P1

**Current state.** A durable inbox records idempotency, leases, attempts, retry timing, dead-letter status, and replay. Processing writes are transactionally grouped. External GitHub actions avoid automatic repeated POSTs after ambiguous outcomes and expose reconciliation. Liveness and database/schema readiness are separate.

**Strengths.** Bounded jittered retry, deduplication, lease recovery, transaction rollback, manager-controlled replay, and conservative unknown-provider state are good reliability primitives.

**Weaknesses and risks.** A worker claim is identified by owner string/status, not a unique generation token. A reclaimed claim may therefore be difficult to distinguish from an earlier claim using the same stable worker ID. Schedule callback failures are logged but not persisted as last-error state. Registration existence is not freshness/success. Queue health is a capped 1,000-row sample. There is no visible graceful shutdown path. Failed payload excerpts have no TTL/redaction policy.

**Why it matters / long-term impact.** Durable storage prevents many lost-event cases, but does not prove the worker is running or safely fencing stale claims. Backlog growth can remain hidden and operator recovery can become manual. External unknown outcomes must remain unknown until positively reconciled; absence from bounded provider reads is not proof of failure.

**Recommendations.** Add a unique claim token/generation and verify it for all completion/failure transitions; test expiry/reclaim races. Persist callback success/failure timestamps and distinguish storage readiness from processing readiness. Add aggregate queue-age/attempt/dead-letter signals and graceful SIGTERM handling. Keep external retry policy conservative.

**Difficulty / benefit.** Medium-to-high due to actual TiDB concurrency validation; high benefit for safe operations.

**Evidence.** `server/events/processor.ts:23–38, 163–207`, `server/events/scheduled.ts:57–73`, `server/events/router.ts:49–65, 112–127`, `server/_core/index.ts:31–45, 78–84`, `server/integrations/github/actions.ts:197–289`, `server/mysql.integration.test.ts:7–23, 34–118`.

**Confidence / limits.** Medium. The claim/health gaps are source-visible; concurrency failure and deployed worker state were not reproduced.

### 5.4 Backend APIs, algorithms, data structures, and edge cases — Rank 4, P1

**Current state.** Express, raw webhooks, scheduled callbacks, tRPC routers, Drizzle access, and pure domain helpers are separated to a useful degree. Work is bounded in important flows; model output is schema-checked and citations are constrained to IDs in context.

**Strengths.** Temporal selection, planning, retries, conflict evaluation, and grounding have pure/testable boundaries. `/asOf` identifies overflow and reasoning rejects oversized one-shot contexts rather than silently analyzing a subset. Action conflict queries are batched.

**Weaknesses and risks.** World Model and reasoning assemble many parallel reads without a common read snapshot; reasoning records `snapshotTime` after the reads. Some collection APIs cap results without continuation/completeness metadata. Bounded reconstruction includes repeated scans/sorts that can be quadratic. Worker drain counters may report outcomes even where a transaction no longer owns the event. Provider duplicate suppression reads up to 1,000 rows without an overflow signal. Citation validation proves identifier membership, not that prose is supported by the cited evidence.

**Why it matters / long-term impact.** Mixed-time context weakens reproducibility; silent list caps can hide relevant records; complexity and fixed caps create future ceilings; and ID membership should not be sold as semantic entailment.

**Recommendations.** Define a common as-of snapshot contract (or query-level cutoff contract) and persist its exact cutoff. Add cursor pagination or explicit `hasMore` to fixed-limit APIs. Use indexes/maps for bounded data processing. Return discriminated committed/lost-lease outcomes from worker state transitions. Make the citation limitation explicit and consider claim-to-excerpt review rather than promising automatic entailment.

**Difficulty / benefit.** Medium-to-high; high benefit to correctness, scale, and auditability.

**Evidence.** `server/domain/router.ts:32–74, 112–125`, `server/intelligence/router.ts:97–152`, `server/events/processor.ts:129–207`, `server/intelligence/grounding.ts:27–47`, `server/operantRecordsRouter.ts:42–46, 209–216`, `server/operantActionsRouter.ts:42–50`.

**Confidence / limits.** High for source-level behavior; no query execution, concurrency simulation, or semantic model evaluation was run.

### 5.5 Testing and verification confidence — Rank 5, P1

**Current state.** Vitest is configured for server-side TypeScript tests. There are useful pure tests for temporal boundaries, conflict selection, retries, grounding, planning, crypto helpers, payload validation, and selected DB constraints/transactions. Three DB tests are opt-in.

**Strengths.** Tests cover meaningful valid/knowledge-time boundaries, delayed provider deliveries, conflicting assertions, validation edge cases, and safe DB-test opt-in controls. Separate scripts exist for type checking, tests, build, and Drizzle journal checks.

**Weaknesses and risks.** The configured suite does not cover client UI. Most tRPC/Express procedures and integration boundaries are not tested at the request/service level. No action proposal→manager hash approval→execution→provider read-back E2E/service test is visible. There is little race testing for inbox claims, duplicate deliveries, approvals, or tenant bootstrap. No tracked CI workflow or coverage threshold was found. A test-named DB is not inherently disposable.

**Why it matters / long-term impact.** Current helper tests do not prove middleware composition, database isolation semantics, exact persisted-state behavior, or one-shot provider writes. Without automated gates, documented checks may not run consistently.

**Recommendations.** Add required CI for check/test/build/schema checks; add isolated TiDB-compatible concurrency and rollback tests; add request/service action tests with mocked provider transport; test workspace denial at router boundaries; harden DB-test host/credential allowlists; and add client accessibility/smoke coverage where it protects a high-consequence flow.

**Difficulty / benefit.** Moderate for CI, high for robust DB concurrency and action lifecycle harness; very high benefit.

**Evidence.** `vitest.config.ts:15–18`, `package.json:6–17`, `server/mysql.integration.test.ts:7–117`, `server/integrations/github/actions.ts:161–254`, `server/operantActionsRouter.ts:247–339`, repository inventory contains no tracked CI workflow.

**Confidence / limits.** Medium. The test inventory was inspected, not executed; external CI could exist outside the repository.

### 5.6 Logging, monitoring, and operational signals — Rank 6, P1

**Current state.** The server adds correlation IDs, logs request method/path/status/duration, separates liveness and readiness, and stores event attempts and error classes. The Settings UI shows health data, but no metrics exporter, external alerting, SLO, or run-freshness contract was found.

**Strengths.** Correlation reaches response headers; readiness probes database and queue schema; payloads/secrets are generally not logged; queue state has timestamps and attempts suitable for telemetry.

**Weaknesses and risks.** Readiness checks for any active schedule row, not the exact Operant retry schedule or a recent successful execution, and may return healthy while the worker flag is false. Queue health counts a capped sample, without age, lease churn, or retry/dead-letter rate. Log structure and redaction are not uniform; some user-defined identifiers may enter warnings.

**Why it matters / long-term impact.** An operational intelligence system can be durable but still stale. Without queue lag and worker-freshness signals, evidence delay may be discovered by users rather than operators; SLOs cannot be set from missing data.

**Recommendations.** Define acceptance/processing SLOs; expose privacy-safe aggregate queue age, oldest due event, retry/dead-letter rate, lease expiry, and worker last success; check the exact schedule identity; establish structured log allowlists and correlation propagation; add readiness/correlation tests and an alert owner/runbook.

**Difficulty / benefit.** Medium-to-high; platform monitoring integration and delivery require operational ownership. High benefit.

**Evidence.** `server/_core/index.ts:31–55, 74–91`, `server/observability/correlation.ts:4–15`, `server/events/router.ts:112–127`, `server/events/processor.ts:163–207`, `client/src/pages/Settings.tsx:8–52`.

**Confidence / limits.** High for repository gaps; external log sinks/alerts and current deployment status were not inspected.

### 5.7 Architecture, structure, maintainability, and extensibility — Rank 7, P1

**Current state.** Typed router composition and domain folders coexist with large root-level routers. Pure helpers represent many complex rules, but several handlers still perform input validation, authorization, SQL construction, policy, transactions, and response shaping together.

**Strengths.** Meaningful seams exist for temporal selection, conflicts, events, GitHub, intelligence, and retry policy. Workspace access is centralized. Page routes are lazy-loaded.

**Weaknesses and risks.** Module layout is transitional; `intelligence` and `reasoning` are overlapping top-level router surfaces. World Model and reasoning independently assemble overlapping context. Helpers such as insert-ID extraction and workspace record validation are repeated. The schema is a broad central catalog. Fixed one-shot caps lack a continuation architecture.

**Why it matters / long-term impact.** As providers and record types increase, route modules can become harder to reason about and duplicated temporal/query semantics can drift. Larger tenants will require cursor/scoped reads rather than simply larger constants.

**Recommendations.** Extract shared, typed World Model/reasoning context services and action-proposal evaluation first; keep authorization at router boundaries and transaction ownership explicit. Clarify feature naming/layout incrementally. Consolidate primitives only where semantics match. Avoid a generic repository abstraction that hides workspace scope or transaction boundaries.

**Difficulty / benefit.** Medium-to-high; high maintainability and consistency benefit.

**Evidence.** `server/operantRouter.ts:11–20`, `server/domain/router.ts:31–125`, `server/intelligence/router.ts:61–119`, `server/operantActionsRouter.ts:41–174`, `server/operantRecordsRouter.ts:19–166`, `vitest.config.ts:15–18`.

**Confidence / limits.** Medium-high for observed layout; no maintainability or contribution-time metrics were measured.

### 5.8 Backend scalability and resource performance — Rank 8, P1

**Current state.** Many tables have workspace-leading indexes, and several expensive paths are bounded. The inbox is durable, while a recurring worker claims one row and drains up to ten serially. No pool limits, query-plan checks, benchmarks, backend cache, or queue-age SLO metrics were found.

**Strengths.** Bounded snapshots, N+1 truncation probes, parallel independent reads, request-size caps, a model timeout, a bounded worker batch, and recent conflict-query batching.

**Weaknesses and risks.** Entity/relationship/obligation APIs can return all workspace rows. As-of and reasoning load many workspace-wide collections into memory. Some indexes may not match sorted access patterns (not confirmed by plans). Inline webhook/manual paths await a drain. Fixed reasoning caps become feature limits. Serial oldest-first queue processing may create lag/fairness issues under burst load.

**Why it matters / long-term impact.** History growth may increase memory, response sizes, tail latency, or evidence lag. But these are risks, not measured production defects; indexes and concurrency must be validated on TiDB, not inferred from names.

**Recommendations.** First establish representative TiDB plans, p50/p95, rows examined, memory, pool use, and queue age. Then add keyset pagination and scoped reasoning; measure before changing indexes. Test bounded fair queue claims against TiDB before parallelizing. Configure explicit pool timeouts/concurrency and consider moving routine event work off request paths.

**Difficulty / benefit.** Medium-to-high; high potential benefit, dependent on workload measurement.

**Evidence.** `server/db.ts:6–18`, `server/operantRecordsRouter.ts:42–46, 110–113, 289–293`, `server/domain/router.ts:32–64`, `server/events/processor.ts:23–38, 163–208`, `server/events/scheduled.ts:57–67`.

**Confidence / limits.** Medium. No DB plan, workload, cardinality, resource limit, or performance measurement was available. GPU is not applicable to the local backend.

### 5.9 Deployment, runtime configuration, and portability — Rank 9, P1

**Current state.** A single-stage Node 22 Docker build uses the pinned pnpm version and frozen lockfile, binds to `0.0.0.0`, honors validated `PORT`, and serves built Express/tRPC plus SPA assets. Business data is external DB-backed. Migrations are separate release operations. The app has no-store health/readiness and a runtime public-config allowlist.

**Strengths.** Environment files are excluded from the Docker context; public config is explicitly whitelisted; app health and DB/schema readiness are distinct; local disk is not used as durable event storage.

**Weaknesses and risks.** No production-required environment validation at startup, no explicit graceful shutdown, single-stage image retains development dependencies, no non-root `USER` or healthcheck, and no explicit static cache policy. Readiness can return 200 while worker registration is false. Resource, rollout, backup, and probe policies remain outside the repository.

**Why it matters / long-term impact.** A process can serve traffic while partially configured; rolling termination may interrupt work; storage readiness alone does not prove recovery is active. Undocumented platform assumptions reduce portability and can create delayed failures.

**Recommendations.** Validate required configuration without logging secrets; make worker health explicit and separately alertable; implement bounded graceful shutdown; harden/prune runtime image; specify cache policy per asset/HTML/API; document migration order, backups, key custody, and platform termination grace. Size resources only after measuring.

**Difficulty / benefit.** Medium; high release reliability and portability benefit.

**Evidence.** `Dockerfile:1–13`, `.dockerignore:1–8`, `server/_core/env.ts:1–12`, `server/db.ts:6–19`, `server/_core/index.ts:31–85`, `server/_core/vite.ts:50–67`, `server/integrations/github/crypto.ts:5–37`.

**Confidence / limits.** Medium. No image, deployed platform configuration, orchestrator, or live endpoint was inspected during the audit.

### 5.10 UX, accessibility, responsiveness, and cross-platform behavior — Rank 10, P1

**Current state.** Operant has a custom operational shell, clear page titles, landmarks, native controls, a visible focus style, responsive breakpoints, and workflows that separate approval from execution. No device/browser/assistive-technology pass was performed.

**Strengths.** Semantic shell and labels exist; mobile layouts reflow; partial World Model state and some status changes are announced; consequential action stages are explained.

**Weaknesses and risks.** At narrow widths the sidebar containing the only sign-out control is hidden; `maximum-scale=1` restricts zoom; dense operational typography includes 8–10px text; many success/error mutations are not live regions; no reduced-motion override was found. These can affect access to a safety-critical product, not just visual polish.

**Why it matters / long-term impact.** Users need to perceive evidence and state transitions to perform a valid review. Low-vision/screen-reader users may miss action outcomes; mobile users may lack an obvious sign-out path.

**Recommendations.** Restore zoom; expose a labelled mobile profile/sign-out control; standardize live status/error announcements and form associations; establish readable typography tokens; honor `prefers-reduced-motion`; add keyboard/screen-reader/responsive regression coverage.

**Difficulty / benefit.** Low-to-medium for core fixes; high usability and governance benefit.

**Evidence.** `client/index.html:6–8`, `client/src/components/OperantShell.tsx:91–129`, `client/src/index.css:434–455, 513, 545–621, 660–704`, `client/src/pages/Actions.tsx:32–83`, `client/src/components/GitHubActionControls.tsx:32–62`.

**Confidence / limits.** Medium. All behavior is source-level; no screen reader, browser, keyboard, zoom, or touch testing was done.

### 5.11 Documentation and developer experience — Rank 11, P1

**Current state.** README, engineering report, `.env.example`, and living backlog describe setup, migrations, integrations, verification, and unverified gates. Documentation is unusually transparent about skipped tests and deployment assumptions, but parts are environment-specific and can age.

**Strengths.** Commands, secrets boundaries, migration sequence, Heartbeat lifecycle, and action-governance constraints are documented. The DB-test URL is blank by default. The backlog records technical alternatives rather than just feature wishes.

**Weaknesses and risks.** Database support is described generically as MySQL while the report says managed TiDB with compatibility limits. README calls `/api/ready` private though source shows cache-control rather than an authentication check. Migration 0006 recovery/preflight is not a reproducible checklist. `db:push` behavior is not clearly documented. The dated report is not linked from README and can be mistaken as current.

**Why it matters / long-term impact.** Ambiguity around DB targets, readiness privacy, or migration execution can cause unsafe operational choices and repeated onboarding effort.

**Recommendations.** Clarify MySQL/TiDB target matrix and migration preflight/recovery; document readiness as non-cacheable versus authenticated; explain `db:push` or remove ambiguous shortcut; link/mark dated report and backlog as historical; add a fresh-clone onboarding and contributor architecture guide.

**Difficulty / benefit.** Low-to-medium; high onboarding and operational safety benefit.

**Evidence.** `README.md:5–20, 28–63`, `.env.example:1–23`, `server/_core/index.ts:31–45`, `package.json:6–17`, `ENGINEERING_REPORT.md:3, 44–58, 70–80`, `ENGINEERING_BACKLOG.md:3–45`.

**Confidence / limits.** Medium. Review was source/document-level; external onboarding experience was not observed.

### 5.12 Frontend rendering and delivery performance — Rank 12, P2

**Current state.** The React/Wouter SPA lazy-loads nine page modules and uses `httpBatchLink`. Private API/config responses are no-store. Lists are mostly rendered directly. No explicit query freshness policy, application-level cache/compression policy, bundle budget, or Web Vitals instrumentation was found. A prior local `dist` artifact showed raw JS/CSS byte counts; these are not transfer or performance measurements.

**Strengths.** Lazy routes, Suspense/ErrorBoundary, batching, workspace-gated queries, and loading states help constrain first-route work.

**Weaknesses and risks.** Auth, workspace selection, route code and page data create a sequential first-use path. QueryClient uses defaults and some views refetch on focus. Several views render whole result lists. Static asset caching/compression is not explicit in app code; ingress behavior is unknown.

**Why it matters / long-term impact.** Larger workspaces and slower devices can increase DOM, memory, and network work; repeated fetches can add load. Magnitude is unknown without instrumentation.

**Recommendations.** Instrument route readiness, Web Vitals, transfer bytes, API counts/latency; define per-query freshness; paginate long histories; defer expensive detail rendering; configure content-hash assets and HTML/config/API cache separately, then verify deployed ingress behavior.

**Difficulty / benefit.** Medium; potentially high but must be measured.

**Evidence.** `client/src/App.tsx:1–19, 43–64`, `client/src/main.tsx:11, 40–76`, `client/src/pages/Evidence.tsx:20–45, 106–126`, `client/src/pages/Events.tsx:23–56`, `server/_core/vite.ts:50–65`, `vite.config.ts:155–188`.

**Confidence / limits.** Medium. No network waterfall, runtime profile, device matrix, or production CDN inspection was performed; GPU acceleration is not applicable to current UI features.

### 5.13 Build, dependencies, and supply-chain hygiene — Rank 13, P2

**Current state.** The repo pins pnpm, commits a lockfile, uses frozen-lockfile container installation, restricts allowed dependency build scripts, and tracks a local Wouter patch. No tracked CI, update automation, or vulnerability scanning was found.

**Strengths.** Pinned package manager, lock/integrity metadata, limited lifecycle scripts, explicit patch file, and documented validation commands.

**Weaknesses and risks.** No automated CI evidence means checks may be inconsistent. No advisory/update automation was found; this is a process gap, not evidence of a current vulnerable package. The image is single-stage, includes development dependencies, and uses mutable `node:22-bookworm-slim`; no exact Node patch/engine declaration or artifact provenance is evident.

**Why it matters / long-term impact.** Without automated update signals and repeatable image inputs, vulnerable or obsolete packages may go unnoticed and rebuilds may drift. Lockfiles constrain versions but do not establish that they are safe.

**Recommendations.** Add required CI with pinned Node/pnpm and project checks; introduce reviewed dependency-update/advisory scans; prune final image and run non-root; pin base images by digest with a deliberate update cadence; maintain a regression test and owner for the Wouter patch. Do not add broad warning suppression.

**Difficulty / benefit.** Moderate; high release-assurance and maintenance benefit.

**Evidence.** `package.json:6–17, 85–110`, `pnpm-lock.yaml:1–13, 281–301`, `pnpm-workspace.yaml:1–10`, `Dockerfile:1–12`, `.gitignore:5–8`.

**Confidence / limits.** Medium. No install/build, advisory database, image scan, or external CI settings were inspected; no current CVE claim is made.

## 6. Architecture alternatives and selected direction

### Temporal history alternatives

1. **Patch the World Model route only.** Minimal diff and fastest; risks a second temporal implementation and future drift.
2. **Extract a pure resource-version selector into the existing temporal domain module.** Reuses one testable policy, preserves current schema and API payload shape, and can be applied by the World Model route. **Selected for the current focus.**
3. **Migrate to a normalized append-only temporal ledger with explicit temporal mode/stream identity and DB-enforced ranges.** Strongest long-term semantics, but introduces migration/backfill and API transition work. Defer until the current incremental semantics are corrected and the evidence inventory is known.

The selection follows bitemporal principles already recorded in `ENGINEERING_BACKLOG.md`: valid/effective time and transaction/knowledge time answer different questions. Helpful background includes [Martin Fowler’s bitemporal history](https://martinfowler.com/articles/bitemporal-history.html), [XTDB’s bitemporality documentation](https://v1-docs.xtdb.com/concepts/bitemporality/), and the [2021 temporal graph analytics position paper](https://doi.org/10.1145/3461837.3464514). These references motivate explicit temporal axes; they do not prove this application’s implementation is correct.

### Broader architectural direction

Keep the existing React + Express/tRPC + Drizzle stack for now. Avoid a full rewrite without evidence that it removes a measured constraint. Extract application/query services from high-consequence route handlers; keep workspace authorization and transaction boundaries explicit; share temporal query and completeness policy; and introduce pagination/snapshot semantics before increasing caps. This improves consistency without discarding the existing typed domain and tenant controls.

## 7. Prioritized implementation roadmap

| Order | Work | Acceptance direction | Dependency / caution |
|---:|---|---|---|
| 1 | Correct historical resource-version valid-time reconstruction (implemented) | At a knowledge cutoff where a successor is known, the predecessor remains visible before the successor’s `validFrom`, is absent at/after its exclusive transition, and the successor is visible only during its own interval. | Shared pure selector, no schema change; see Section 9 for validation and remaining limitations. |
| 2 | Define one temporal contract for every mutable record type | Specify null start/end, supersession, correction, effective-time and knowledge-time semantics; cover them with tests and expose unsupported history. | Product/domain decision; do not pretend missing historical data can be reconstructed. |
| 3 | Align provenance constraints and DB tests | Workspace-composite event references and interval/domain constraints where TiDB supports them; test against disposable compatible DB. | Preflight existing rows and verify TiDB behavior before migration. |
| 4 | Make reasoning/world snapshots reproducible and scalable | Common cutoff/snapshot contract, shared query service, pagination or scoped windows, explicit completeness and persisted provenance. | Design API/UI compatibility; do not just raise row caps. |
| 5 | Strengthen action/session privacy boundaries | Revocable sessions, data retention/redaction, least-privilege attempt details, explicit separation-of-duties policy. | Decide retention and independent approval rules; retain auditable hashes/metadata. |
| 6 | Harden durable worker claims and health | Unique claim generation, race tests, exact schedule freshness, aggregate queue-age/lag signals, safe shutdown. | Validate transaction/locking semantics with TiDB, not assumed MySQL behavior. |
| 7 | Make high-consequence flows continuously verifiable | Required CI; router/service tests; concurrent inbox/action tests; provider stubs; authenticated E2E acceptance. | Isolated test DB and credentials; no live provider side effects in ordinary CI. |
| 8 | Operational and UX foundations | Structured telemetry/runbooks/SLO ownership; mobile sign-out, zoom/readability, live regions, reduced motion, accessibility regression checks. | Avoid logging tenant payloads; no UI claims without device/assistive validation. |
| 9 | Measured performance and delivery improvements | Query plans, latency/queue metrics, list pagination, client metrics, cache policy, bundle budget, slim runtime image and dependency automation. | Profile and measure first; cache private/temporal data only with correct isolation/freshness keys. |

## 8. Current focus and remaining audit limits

**Selected domain:** Data model and temporal correctness.  
**Selected defect:** The as-of route removed a resource version as soon as any known successor existed, even when `validAt` preceded that successor’s effective start. This was corrected in the current pass.
**Chosen implementation strategy:** Implement a pure selector in the shared temporal domain, with tests for knowledge time, effective transitions, explicit ends, chained versions, competing branches, cross-resource links, and malformed intervals. Preserve the schema and the API collection shape.
**Not solved by this focus:** Null observation `validFrom` semantics, typed history for fields without audit, cross-workspace `sourceEventId` composite constraints, a common database snapshot for multi-query reads, or complete temporal normalization. These remain explicit backlog items.

No production data or published environment was changed. Validation, local readiness evidence, the self-critique, and next priorities are recorded in Section 9; the project remains an evolving system.


## 9. Implementation result, validation, and self-critique

### Implemented

Added `resolveResourceVersions` to `server/domain/temporal.ts` and wired it into `server/domain/router.ts`. The selector:

- uses `recordedAt <= knowledgeAsOf` to decide which versions were known;
- uses `[validFrom, validTo)` and a known successor’s `validFrom` as the predecessor’s effective end;
- retains a predecessor for historical `validAt` values before that transition;
- handles multi-step chains without rewriting stored rows;
- leaves competing successor branches visible rather than choosing by arrival order;
- refuses to apply a cross-resource successor link and excludes a reversed/malformed interval from both selection and successor-boundary derivation.

No database migration, data rewrite, provider call, shared-database mutation, or public deployment was performed. Existing resource rows are interpreted through the corrected read-time projection.

### Regression and validation evidence

The temporal suite now has **15 passing cases**, including resource pre-transition history, pre-arrival knowledge cutoffs, exact transition boundaries, chains, explicit exclusive `validTo`, competing branches, cross-resource links, and malformed reversed intervals.

| Validation | Result |
|---|---|
| `pnpm check` | Passed |
| `pnpm test` | **63 passed, 3 skipped**; 12 files passed and the opt-in MySQL integration file was skipped |
| `pnpm build` | Passed; retains the existing non-fatal Vite notice for runtime-loaded `/api/platform/config.js` |
| `pnpm exec drizzle-kit check` | Passed |
| `git diff --check` | Passed |
| Fresh local production bundle: `/api/health` | HTTP 200, `{"status":"ok"}` |
| Fresh local production bundle: `/api/ready` | HTTP 200; database and event-queue schema healthy; `activeRetryScheduleRegistered: false` |
| Fresh local production bundle: `/manus-routes.json` | HTTP 200; 9 routes |
| Temporary validation process | Explicitly stopped; port 3110 confirmed released |

The false retry-schedule flag is not a regression and was not changed in this pass: it remains an operational activation gate. A healthy database/schema response does not establish that scheduled recovery is running. The isolated check was local to the sandbox; it does not prove public ingress or deployment readiness.

### Self-critique and residual uncertainty

1. **The selector policy is now tested as a pure function, not as a database-backed tRPC response.** At this historical checkpoint, three opt-in MySQL tests were skipped because no distinct disposable test database was configured; Section 11 records the later fourth test and latest four-test skip status. The full SQL/read-boundary behavior and TiDB timestamp serialization still need an isolated integration test.
2. **Malformed persisted rows do not yet create an operator-visible incompleteness signal.** The selector avoids letting a reversed interval rewrite its predecessor, but the API does not report the count or IDs of invalid version rows. A future response contract should mark the affected resource history uncertain rather than silently treating it as ordinary complete data.
3. **Zero-length intervals remain a policy question.** Current input validation permits `validTo === validFrom`; under half-open semantics the row has no active duration, but a supersession link can still end the predecessor at that instant. Decide whether this is an intentional withdrawal/tombstone convention or reject it consistently at the API and database layers.
4. **The selector derives transition semantics from `supersedesVersionId` and `validFrom`.** That is consistent with the present resource-version schema and UI, but providers, corrections, withdrawals, and forecasts may need explicit temporal modes. A normalized ledger is still a future option, not required for this correction.
5. **Completeness depends on the existing version-row cap.** `/asOf` already probes one extra row and labels a truncated resource-version collection incomplete; callers must continue to honor that metadata. Pagination is still needed before larger workspaces can receive complete reconstructions.
6. **No live action flow, authenticated tenant behavior, worker registration, concurrency race, or accessibility session was tested in this pass.** The full audit’s other P1 findings remain open.

### Next priority selected

The next immediately actionable item is a **least-privilege repository CI workflow** for pull requests and main-branch pushes. It should pin the supported Node/pnpm toolchain, install from the frozen lockfile, run `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm exec drizzle-kit check`, and receive no live database or provider secrets. The MySQL suite must remain skipped unless an explicitly isolated disposable database is provisioned. This is the safest way to make the existing verification repeatable while the deeper service-level and concurrency test design proceeds.


## 10. CI and tenant-provenance follow-up (2026-10-08)

### CI workflow implemented
Added `.github/workflows/ci.yml` for `pull_request`, `main` pushes, and manual runs. It grants only `contents: read`, disables checkout credential persistence and caches, receives no database/provider secrets, installs with `pnpm install --frozen-lockfile`, then runs `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm exec drizzle-kit check`. GitHub Actions are pinned to verified full commit SHAs: `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0, and `pnpm/action-setup` v6.1.0. Node follows the Node 22 LTS line; pnpm is read from the repository’s exact `packageManager: pnpm@10.18.0` declaration. The newer `pnpm/setup` action was rejected because its current metadata requires pnpm 11 or newer.

The workflow parses and passes Prettier; a static guard confirmed all three action references are full 40-character SHAs, token permission is read-only, and no secrets/cache writes are configured. The exact frozen install completed locally with pnpm 10.18.0. A hosted GitHub run has **not** occurred: the workflow is only in the Sandbox working tree and no push/PR execution was performed. At this checkpoint, validation showed 63 tests passed and 3 opt-in MySQL tests skipped; the later Section 11 validation supersedes this count after adding the provenance regression (63 passed, 4 skipped).

Relevant primary references: [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use), [pnpm continuous integration](https://pnpm.io/continuous-integration), and the pinned [pnpm/action-setup source](https://github.com/pnpm/action-setup/tree/ea17c68df8912ef543352723c149a84f56e3d413).

### Initial TiDB/provenance investigation
A read-only query of the configured shared database returned server `8.0.11-TiDB-v8.5.3-serverless`, with both `@@SESSION.foreign_key_checks` and `@@GLOBAL.foreign_key_checks` equal to `1`. The live `information_schema` confirms the existing evidence/observation foreign keys are present, including `ON DELETE SET NULL` for each `sourceEventId`. TiDB’s versioned [foreign-key guide](https://docs.pingcap.com/tidb/v8.5/foreign-key/) says FK checks are supported since 6.6 and generally available in 8.5, enabled by default; this resolves the earlier compatibility uncertainty for the live database. However, those two event references target only the globally unique event ID, not `(workspaceId, id)`, so they do not enforce event/workspace agreement at the database edge.

The initial review concluded a composite FK with `ON DELETE SET NULL` is not a safe drop-in: TiDB sets **all** child columns in the FK tuple to `NULL`, which would violate the required non-null workspace key. A nullable shadow workspace field would need an equality CHECK; TiDB’s [8.5 constraints guide](https://docs.pingcap.com/tidb/v8.5/constraints/) states CHECK constraints are disabled by default and require `tidb_enable_check_constraint=ON`, creating an avoidable connection/session dependency. At this checkpoint the deletion policy was still open and no schema/database change had been made. Section 11 records the approved RESTRICT design, generated unapplied migration, and read-only preflight outcome.


## 11. Tenant-scoped event provenance implementation (2026-10-08)

This section supersedes the pending design choice recorded in Section 10. The approved direction is a composite tenant FK with `ON DELETE RESTRICT`; any retention purge must detach source links and audit that operation within the same transaction.

### Implementation
`drizzle/schema.ts` now models both `evidence` and `observations` provenance as `(workspaceId, sourceEventId) -> inbound_events(workspaceId, id)`, with explicit `(workspaceId, sourceEventId)` indexes. The new `drizzle/0007_tenant_scoped_event_provenance.sql` adds indexes and composite constraints before removing the legacy single-column FKs and their obsolete auto-indexes. This add-before-drop order preserves the old integrity path if a new constraint cannot be established. The schema table declarations were reordered only to allow Drizzle's lazy FK references to initialize correctly.

The current implementation has no event-retention/deletion API. An opt-in MySQL integration test encodes the required future purge contract: cross-workspace evidence/observation references are rejected; direct event deletion is restricted while links exist; a single transaction detaches both provenance links, writes an `audit_log` record, and then deletes the event while preserving the evidence and observation. No retention TTL, eligible-status policy, or user-facing purge operation was invented in this change.

### TiDB migration safety
A read-only preflight against the configured TiDB 8.5.3 database found **zero** cross-workspace source-event references in `evidence` and **zero** in `observations`. The migration was generated and reviewed but **not applied** to the shared database. A preflight must be rerun immediately before deployment and event writers paused between preflight and DDL to prevent a race.

The versioned [TiDB foreign-key guide](https://docs.pingcap.com/tidb/v8.5/foreign-key/) explains that FK-changing `ALTER TABLE` operations require `SESSION foreign_key_checks=OFF`; this finding changes the migration procedure. Migration 0007 scopes the setting to its migration session, performs the reviewed changes, and restores it to `ON`. Use a dedicated migration connection and do not reuse a session if a failed migration prevented the restore statement from running. TiDB's [ALTER TABLE compatibility guide](https://docs.pingcap.com/tidb/v8.5/sql-statement-alter-table/) documents ordering restrictions for multi-object DDL; the migration uses separate statements and explicit breakpoints.

### Validation and remaining evidence gap
After the code/migration edits, `pnpm check`, the full Vitest suite (**63 passed; 4 opt-in MySQL tests skipped**), `pnpm build`, `pnpm exec drizzle-kit check`, migration-order assertions, and `git diff --check` passed. The MySQL test skip is deliberate: no separate disposable DB URL is configured, and the shared database was not used for writes or DDL. Application of migration 0007 remains a separate, explicit deployment approval step. The first hosted GitHub Actions run also remains pending a push/PR.
