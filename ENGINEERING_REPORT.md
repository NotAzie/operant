# Operant — Engineering Report

**Date:** 2026-10-05
**Scope:** Upgrade the Level 2 technical prototype into the Level 3 Operational Intelligence implementation described in `plan.md`.

## Executive summary

Operant now has a substantially expanded backend-first architecture for evidence-backed temporal state, durable event intake, grounded advisory reasoning, and governed actions. The Events, Intelligence, World Model, GitHub settings, and action-review surfaces are wired into the existing application shell. Workspace boundaries, explicit identity decisions, approval records, provider verification, request correlation, CSRF/origin handling, rate limits, and operational status are represented in the code.

**The Level 3 database schema is now applied to the shared project database.** Migrations 0004–0006 completed after a MySQL identifier-length correction and a forward-only recovery of the partially applied 0004 migration. The reported `github_connections` select now succeeds, and local and public Preview `/api/ready` both return HTTP 200 with database and event-queue schema healthy. Production Heartbeat registration remains pending. A connected GitHub repository, an authenticated end-to-end user session, and a distinct disposable MySQL test database were unavailable, so the full representative scenario remains unverified.

## Delivered implementation

### Temporal world model and evidence

- Added temporal assertions, source/external identity records, explicit identity candidates, resource/version/allocation records, responsibility assignments, conflict records, and evidence-linked provenance.
- Added a workspace-scoped as-of API that separates knowledge time from valid/effective time and reconstructs supported historical corrections from retained audit snapshots. Provider snapshots now use source-effective-time ordering within provider connections, so delayed older deliveries do not become retroactive corrections or false conflicts; distinct connections remain independent.
- Entity corrections and obligation status changes retain before/after or completion-evidence history; entity and obligation screens expose record-specific history.
- Entity and relationship creation commit the base record, operational event, and audit row atomically. Entity corrections and identity-candidate decisions lock and reread their target row inside the transaction before writing history, preventing stale concurrent decisions.
- Identity candidates require evidence and a human decision. Confirmation records a relationship only; entity records remain separate and are never silently merged.
- Validity ranges reject `validTo` values before `validFrom`.

### Durable events and GitHub

- Added a MySQL-backed inbox/attempt model with idempotency, leases, bounded retry/backoff with full jitter, dead-letter visibility, replay controls, and a platform-authenticated scheduled drain callback. A single drain invocation excludes event IDs it already claimed, avoiding repeated retries of the same event within one batch. Conflict refresh uses an N+1 probe and preserves existing conflict rows if the scan is incomplete; the incomplete attributes are persisted with the event result and shown in the Events ledger.
- Added raw-body GitHub webhook signature verification, connection-scoped routing, delivery deduplication, payload validation, and rate limiting. New persisted retry payloads omit unused sender identity/unrelated fields and cap issue-body text to the 1,500-character evidence excerpt; after successful processing the body is cleared atomically while the signed payload hash, routing identifiers, source URL, title, and evidence remain. The consumer remains compatible with the prior persisted shape (sender object and bodies up to 12,000 characters) so an upgrade does not dead-letter older queued events. This forward-only change does not bulk-rewrite already-processed rows. Unresolved retry/dead-letter retention still needs an explicit TTL/redaction policy.
- Added encrypted workspace GitHub credentials and a workspace Settings lifecycle for connect, webhook-secret rotation, and disconnect. The project’s application encryption key is configured in WebDev; credential values are not exposed by this report.
- Added a single stable Heartbeat worker register/reconcile flow, gated to production and available to workspace managers after deployment.

### Grounded intelligence and action governance

- Added schema-validated reasoning with live model-catalog filtering, evidence/citation checks against the supplied workspace context, explicit uncertainty, and persisted run/context provenance. Reasoning now probes every bounded collection one row past its cap and refuses to create a run when any collection exceeds its safe one-shot budget; only current provider-stream assertions are supplied after shared temporal reconstruction.
- Added deterministic advisory plans that include objectives, obligations, evidence, conflicts, resources, and responsibility constraints; model output cannot write world state or authorize actions.
- Internal follow-up proposals and GitHub comments remain distinct action types. Action evaluations snapshot actor/role, scope, selected objective, policy/rule context, risk and approval requirements. Internal follow-up proposals are rejected before persistence when linked-evidence or temporal conflict scans exceed their completeness budgets rather than recording a partial scan as clear. Comparable observations for all normalized entity/attribute targets are now fetched in one workspace-scoped query and grouped through the canonical temporal selector instead of issuing one query per target.
- GitHub public comments require manager approval of the exact payload hash, a separately executed one-shot attempt, and a subsequent provider read-back. Provider acceptance is not represented as independent verification.

### Security, observability and UI

- Enforced workspace access and illustrative-workspace write restrictions server-side; added workspace-aware composite database constraints for cross-record links.
- Added same-origin signed CSRF protection, request/event correlation IDs, redacted structured error logging, bounded payloads, and database-backed rate limits for the applicable webhook, reasoning, worker-registration, and GitHub mutation paths.
- Added first-class `/world`, `/events`, and `/intelligence` routes, plus GitHub settings and governed action controls. The World Model API reports per-collection completeness and the UI warns when any display is partial; the root route manifest contains all **9** application routes.
- Added local setup, migration, worker lifecycle, provider configuration, and test guidance in `README.md` and `.env.example`.

## Database and release state

Three Level-3 migrations are applied to the shared project database:

1. `0004_operant_level3_operational_model.sql`
2. `0005_operant_retry_worker_registry.sql`
3. `0006_tenant_workspace_constraints.sql`

Migration `0007_tenant_scoped_event_provenance.sql` is now present and journaled in the working tree, but has **not** been applied to the shared database; it requires a separate approval step.

Migration 0004 creates the Level 3 tables and adds source-event fields; 0005 enforces a unique worker registration name. Migration 0006 intentionally replaces 37 legacy single-column foreign keys with workspace-composite foreign keys and adds 12 composite unique keys. It contains no row deletion, table deletion, or column deletion. Existing cross-workspace reference preflight counts were zero for all 17 checked relationships.

The first migration attempt stopped at a generated 82-character foreign-key identifier (MySQL limit: 64). MySQL had retained earlier DDL while Drizzle correctly left 0004 unrecorded. The identifier was shortened consistently in migration 0004 and 0006 and in the 0004/0005 snapshots; exactly the 20 verified-missing 0004 tail statements were applied, then the matching Drizzle checksum/timestamp was recorded. Migrations 0005 and 0006 then completed through `pnpm db:migrate`. The shared database migration history contains seven entries through 0006; the local working-tree journal now includes 0007 as pending and unapplied. `drizzle-kit check` passes.

The exact failing `github_connections` query was executed successfully against the migrated database and returned zero rows. Both local and public Preview returned HTTP 200 for `/api/health` and `/api/ready`; readiness reports `database: ok`, `eventQueueSchema: ok`, and `activeRetryScheduleRegistered: false`. The false worker flag is expected until a manager registers the production Heartbeat callback after deployment.

A read-only server-version query identifies the shared backend as TiDB v8.5.3 Serverless with MySQL 8 compatibility, not full MySQL feature parity. TiDB's official compatibility documentation marks `SKIP LOCKED` unsupported, so queue concurrency work must use alternatives verified against TiDB rather than assuming MySQL syntax compatibility.

## Validation performed

| Check | Result |
| --- | --- |
| `pnpm check` (whole-project TypeScript) | Passed |
| `pnpm test` | **63 passed; 4 skipped** (12 test files passed, one integration-test file skipped) |
| `pnpm build` | Passed; Vite and server bundle produced |
| `pnpm exec drizzle-kit check` | Passed |
| Route manifest/source comparison | Passed; 9 routes match |
| `git diff --check` | Passed |
| Dev Preview and sandbox public `/api/health` | HTTP 200 `{"status":"ok"}` |
| Production-entrypoint `/api/health` | HTTP 200 `{"status":"ok"}` |
| Production route manifest | HTTP 200 with the expected 9 routes |
| Exact `github_connections` list query | Passed; no connection rows exist yet |
| Local and public Preview `/api/ready` | HTTP 200; database and event-queue schema ready; Heartbeat not registered |
| Fresh production bundle on isolated sandbox port after action-conflict batching: local `/api/health`, `/api/ready`, and `/manus-routes.json` | All returned HTTP 200; database and event-queue schema ready, route manifest lists 9 routes; `activeRetryScheduleRegistered: false` |
| Temporary public ingress probe before the final compatibility update | HTTP 502 sandbox wake-up page, not an application response; external ingress was not re-verified after the final update |

The four opt-in MySQL integration tests were skipped because `OPERANT_TEST_DATABASE_URL` is not configured. The template leaves this URL blank by default; tests require a separately provisioned disposable database. The suite covers transactional queue persistence, tenant-composite relationships and provenance, audited event detachment, atomic record/audit writes, deterministic temporal reconstruction, event payload validation, grounded-citation validation, candidate planning, action/authorization domain rules, and GitHub cryptographic/idempotency helpers. No GitHub API side effects are made by these tests.

This pass also added deterministic tests for provider-stream ordering, capped-context completeness, incomplete conflict windows, jittered retry delay bounds, GitHub payload normalization/compaction and legacy compatibility, and normalized action-conflict target grouping. The `pnpm build` output retains a non-fatal Vite notice for the intentional runtime-loaded `/api/platform/config.js` classic script; the script must remain runtime-loaded rather than bundled.

## Independent review and remediation

One independent read-only Phase 5 review was completed. Its confirmed findings were addressed in the current source:

- Workspace bootstrap/sample creation now locks the authenticated user row inside a transaction before checking or creating the workspace, making retries/concurrent initialization idempotent.
- Evidence/relationship validity ranges now enforce ordered timestamps.
- The Obligations screen uses the same UTC-calendar classifier and configured due-soon policy as the overview.
- Entity and obligation records now show their persisted correction/status history.
- Internal and GitHub action evaluations now persist decision context including actor/role, scope, selected objective when explicitly chosen, policy/rules, risk, responsibility snapshot, and approval requirements.
- Historical reconstruction now accounts for post-cutoff entity corrections, identity decisions, and completion evidence.

The validator’s authenticated OAuth/business-mutation path and live provider path were **unverified**, not inferred as passing. No second full acceptance review was run; affected implementation and test paths were checked after corrections.

## Remaining activation and acceptance gates

1. Run the four opt-in MySQL integration tests against a **distinct disposable test database** when one is available; it was not configured for this session.
2. Register/reconcile the single Heartbeat retry worker in production from the Events screen, then recheck `/api/ready` for `activeRetryScheduleRegistered: true`.
3. Connect a test GitHub repository using a repository-scoped token with the required Issues read/write permission, configure its webhook using the generated secret, and execute the end-to-end issue → inbox → evidence/world model → reasoning → exact-hash approval → comment → independent read-back scenario. This remains unverified: the platform GitHub connector is disabled and no Operant repository connection or authenticated test repository was available.
4. Use an authenticated account to verify OAuth completion, workspace-role denials, tenant isolation, and governed action outcomes against real persisted records.
5. Implement cursor/partition-aware world-model and reasoning reads; current caps now fail visibly/safely, but complete analysis beyond one-shot budgets is not yet supported.

No live GitHub connection or comment was created and no public publish request was made. The user explicitly authorized and the task applied migrations 0004–0006 to the shared project database; migration 0007 is staged in code only and awaits separate approval. WebDev currently reports `publishing.auto_publish: false`.

## Verification endpoint

The freshly built production entrypoint was launched on an isolated sandbox port for validation and stopped afterward. After the action-conflict batch-query change, local `/api/health` and `/api/ready` returned HTTP 200, and `/manus-routes.json` returned the expected nine routes; readiness confirmed the database and event-queue schema. A temporary public-ingress probe during the preceding pass returned HTTP 502 with a sandbox wake-up page, so external ingress was not re-verified after this update. `activeRetryScheduleRegistered: false` remains expected because the current process is not the published production application and no authenticated manager registration was made. This was not a persistent or published deployment URL.


## Non-blocking architecture note

`drizzle/relations.ts` remains empty; current persistence code uses explicit joins and workspace-scoped filters instead of Drizzle relation helpers. This was noted in the independent review and is not a readiness gate, but adding relation metadata may improve future query ergonomics.


## Event provenance tenant-FK follow-up (2026-10-08)

Approved and implemented in code: evidence and observations now bind `sourceEventId` to their own workspace through composite `(workspaceId, sourceEventId) -> inbound_events(workspaceId, id)` foreign keys with `ON DELETE RESTRICT`. Migration `0007_tenant_scoped_event_provenance.sql` adds explicit child indexes and new constraints before dropping legacy single-column FKs/indexes. Direct event deletion is intentionally blocked while source records reference it. Any future retention purge must detach both provenance links and write an audit record in the same transaction before deleting the event. No retention endpoint, TTL, or eligibility policy exists yet.

Read-only preflight against the current shared TiDB 8.5.3 database returned zero cross-workspace references in both `evidence` and `observations`. No DDL was applied. TiDB's [foreign-key documentation](https://docs.pingcap.com/tidb/v8.5/foreign-key/) requires foreign-key-changing ALTER statements to run with `SESSION foreign_key_checks=OFF`; migration 0007 scopes that setting to its migration session and restores it to `ON`. Before any deployment, rerun the two zero-count preflight queries at the top of the migration, pause event writers, and use a dedicated migration connection. Applying this migration still requires separate explicit approval.

Validation after these changes: `pnpm check`, `pnpm test` (63 passed, 4 opt-in MySQL tests skipped), `pnpm build`, `pnpm exec drizzle-kit check`, migration-order assertions, and `git diff --check` passed. The new database constraint/purge regression is opt-in and was not executed because no distinct disposable MySQL/TiDB test database is configured; the shared database was queried read-only only.
