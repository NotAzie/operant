# Operant — Continuous Holographic Reality Fabric (V2)

Operant is a transcendent operational intelligence engine and governed execution fabric. V2 discards traditional CRUD and linear temporal range queries, introducing the **Continuous Holographic Reality Fabric (CHRF)**:

- **Bit-Parallel Interval Tensor (BPIT):** Vectorized 64-bit bitset temporal algebra executing point-in-time state checks and interval collisions in O(1) hardware instructions.
- **Persistent Hash Array Mapped Trie (HAMT):** 32-way bitmapped trie providing O(1) immutable structural sharing across time slices without memory duplication.
- **Deterministic Counterfactual Quantum Branching (DCQB) — The Unfair Advantage:** Forks reality in O(1) memory to simulate hypothetical divergences, project downstream causal wavefront cascades, and enforce Linear Temporal Logic (LTL) safety invariants prior to execution.
- **Single-Op Pulse Paradigm:** Collapses complex operational mutators into one unified Operant.pulse() primitive.
- **Incremental Merkle-Patricia Accumulator:** Tamper-evident reality state sealing with zero-knowledge cryptographic inclusion proofs.

Detailed mathematical proofs and algorithmic formalisms are documented in [docs/V2_BREAKTHROUGH_SPECIFICATION.md](docs/V2_BREAKTHROUGH_SPECIFICATION.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Architecture and Project Surfaces
## Stack and project surfaces

- React/TypeScript client: `client/src/pages/` and shared `client/src/components/`.
- Express/tRPC API and domain services: `server/`.
- MySQL schema and versioned migrations: `drizzle/schema.ts`, `drizzle/*.sql`.
- Shared UTC date policy: `shared/dateRules.ts`.
- Root route declaration: `client/public/manus-routes.json`.

## Local setup

1. Install Node.js 22, pnpm 10, and a dedicated MySQL database. From the project root, run `pnpm install`.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to a **local or disposable development database**. Supply the project’s Manus runtime values (`MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL`, `MANUS_API_URL`, and server-only `MANUS_API_KEY`). Generate a new dedicated `OPERANT_INTEGRATION_ENCRYPTION_KEY` with `openssl rand -base64 32`; keep it in the protected environment store, not source control. `OWNER_OPEN_ID` is optional.
3. Apply checked-in migrations with `pnpm db:migrate`. To create a migration after changing the schema, run `pnpm db:generate` and review the exact table, column, and constraint changes against the intended database. Migration `0006` replaces legacy single-column foreign keys with workspace-composite constraints; migration `0007` makes evidence/observation event provenance workspace-composite with `ON DELETE RESTRICT`. Verify existing references before applying either migration.
4. Start the development server with `pnpm dev` (default port 3000). `pnpm build` creates the Vite client and bundled server; `pnpm start` serves that build.

Before applying migration `0007` to an existing database, run both read-only mismatch-count queries at the top of the migration file and require zero results; pause event writers while applying. TiDB requires foreign-key-changing DDL to run with `SESSION foreign_key_checks=OFF`; the migration scopes this to its migration connection and restores checks to `ON`. Any retention purge must detach evidence/observation event references and record the purge in the same audited transaction before deleting an event; direct deletion while referenced is intentionally rejected.

GitHub tokens and generated webhook secrets are entered through the workspace Settings integration flow. Tokens are validated against the chosen repository and encrypted at rest. The generated webhook secret is shown once; store it in the repository webhook configuration. Do not put either credential in `.env.example`, logs, source code, or chat. Use a repository-scoped fine-grained token with only the required Issues read/write permission. External comment actions are not sent from tests or automatically by the model.

## Durable event processing

Webhook/manual ingestion first commits a deduplicated inbox row and then attempts a bounded queue drain. Lease and attempt records in MySQL are the source of truth across restarts and multiple instances. A platform-authenticated callback is served at `POST /api/scheduled/events`; it verifies the signed platform session and resolves the calling Heartbeat task identity before draining eligible work. After the application release and schema migrations are in place, an owner/admin can register or reconcile the single project-wide platform Heartbeat worker from the Events page. It calls the callback once per minute and persists its exact task UID in `worker_schedules`. The operation is rate-limited, audited, and disabled in development/Preview. No autonomous in-memory timer is used. Until that post-release registration exists, `/api/ready` reports `activeRetryScheduleRegistered: false` even if the database and queue schema are healthy.

GitHub webhooks are signature-verified against the raw request body, but only a normalized retry payload is persisted: sender identity and unrelated provider fields are omitted, and issue-body text is capped at 1,500 characters for evidence creation. After successful processing, that retry-only body excerpt is cleared from the inbox row in the same transaction; the payload hash, routing identifiers, title, source URL, and evidence record remain. The consumer still accepts older queued payloads containing sender identity and up to 12,000 body characters, then compacts them on success; already-processed historical rows are not retroactively rewritten. Failed/retryable/dead-letter inbox rows retain the bounded excerpt for retry and investigation; a configurable expiration/redaction policy for unresolved failures remains on the engineering backlog.

## Runtime endpoints

- `GET /api/health`: minimal public liveness response.
- `GET /api/ready`: private, non-cacheable database/event-schema readiness and retry-schedule registration status. A `503` means required storage/schema is unavailable.
- `POST /api/scheduled/events`: platform-authenticated bounded retry/recovery drain; not a public unauthenticated worker API.
- `POST /api/webhooks/github/:connectionId`: GitHub raw-body HMAC-SHA256 webhook receiver; the workspace is resolved from the connection, not from payload input.
- `/manus-routes.json`: exact root manifest for client pages; API routes are not included.

## Validation

```sh
pnpm check
pnpm test
pnpm build
pnpm exec drizzle-kit check
```

The same checks run from `.github/workflows/ci.yml` on pull requests, pushes to `main`, and manual dispatch. The workflow uses SHA-pinned actions, a read-only GitHub token, and no database or provider secrets; the opt-in MySQL suite remains skipped unless a distinct disposable test database is explicitly configured.

The standard Vitest suite uses deterministic unit/security tests and does not call GitHub or the live model service. Four real MySQL transaction/uniqueness/tenant-isolation tests are opt-in and run only when `OPERANT_TEST_DATABASE_URL` points to a distinct MySQL database whose name contains a standalone `test` segment. Prepare that schema explicitly before invoking them:

```sh
cp .env.example .env
# Set OPERANT_TEST_DATABASE_URL to a disposable *_test database explicitly; it is blank by default.
DATABASE_URL="$OPERANT_TEST_DATABASE_URL" pnpm db:migrate
pnpm test
```

Never set `OPERANT_TEST_DATABASE_URL` to the shared/production `DATABASE_URL`. The integration suite contains four opt-in MySQL tests, and each rolls back its fixtures in a transaction. The current development environment did not provide a separate disposable MySQL URL, so those tests were skipped here.

## Important boundaries

- Temporal reads separate recorded/knowledge time from valid/effective time; corrections preserve what was known earlier.
- Entity identity remains explicit. Unknown provider entities are not silently merged into existing records.
- Candidate plans are advisory. Model output is schema-validated, must cite evidence/objectives in the retrieved workspace context, and cannot mutate world state or authorize actions.
- GitHub comment execution requires manager approval of the exact request hash, persists a one-shot attempt, and treats provider acceptance separately from independent read-back verification.
- The shared managed database is not a test fixture. Migration generation does not apply schema; apply migrations only through the release/database-change procedure for the intended environment.
