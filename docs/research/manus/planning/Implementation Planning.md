# Operant — implementation plan

## Goal and product boundary

Build **Operant** as a working, secure first foundation for the user's operational-intelligence vision—not a conceptual demo. The smallest credible first release will serve an individual or small organization and prove the complete *internal* loop: capture information → preserve its evidence and provenance → build scoped, temporal operational state → surface meaningful changes and obligations → apply transparent deterministic rules → propose an action → check authority → perform a reversible, in-workspace action → verify the result → record history.

This first release will be an honest operational/financial workspace, not an attempt to ship every future domain. It will not claim live integrations, AI reasoning, external action execution, or verified facts that it cannot substantiate. External sources will be clearly marked **not connected**; records explicitly supplied by the user will retain their source label and uncertainty.

## Current project and technical approach

The project has already been initialized at `/home/ubuntu/operant` with the managed `web-db-user` scaffold and server + MySQL-compatible database enabled. Retain its React, TypeScript, Tailwind, Wouter, Express, tRPC, Drizzle, OAuth, and existing health-check infrastructure. Do not replace the stack or create a second project.

Use a browser-rendered React application with same-origin tRPC APIs. The production frontend is the scaffold's static build served alongside the API container; private business data is fetched only through authenticated server procedures. Keep personalized API responses private and non-cacheable; allow long-lived caching only for versioned static assets. Preserve the existing `/api/health` handler, and add the root static `manus-routes.json` manifest before the first dev-server start. Initial page routes: `/`, `/entities`, `/obligations`, `/actions`, `/evidence`, and `/settings` (plus the existing not-found behavior). There is no public marketing/SEO surface in this release.

## Product changes

### 1. Identity, scope, and authority

- Use the starter's real Manus OAuth and validated application session; preserve its `webdev_app_session` compatibility. Do not create a fake preview user or a development authentication bypass. Show an authenticated/logged-out state honestly if callback policy or browser context prevents login.
- Add user-owned workspaces and workspace memberships. Scope every domain record and query to an authorized workspace; do not treat authentication as permission to see every workspace.
- Start with explicit workspace roles: owner/admin can manage workspace policy and approve actions; editor can enter/correct observations, entities, relationships, obligations, and propose actions; viewer can inspect permitted records. Enforce rules server-side, not only in the UI. Keep visibility rights separate from action authority.

### 2. Evidence-backed, temporal world model

Add additive Drizzle schema and migrations for workspaces/memberships, entities, source evidence, observations/state assertions, relationships, operational events, obligations, objectives/policies, actions/action events, and an audit trail. Reuse the starter users table. Keep the first model deliberately general: entity type and relationship predicate can accommodate people, organizations, accounts, assets, documents, invoices, projects, tasks, and later domains without separate applications.

- Give domain records workspace ownership, stable IDs, creation/update metadata, and provenance links. Store evidence as source-labelled records and preserve it when assertions are corrected or superseded.
- Distinguish occurred/happened, observed, recorded/learned, valid-from/to, scheduled/expected, and due times where relevant. Preserve historical assertions and relationship validity rather than silently overwriting history.
- Represent epistemic state and quality explicitly: observed, derived, inferred, predicted, proposed, executed, confirmed; plus unknown, uncertain, conflicting, stale, incomplete, unavailable, unresolved, and confidence/freshness. Never promote inference or prediction to observation.
- Keep conflicting observations and their sources recoverable. Identity matches remain separate/unresolved unless a user explicitly confirms a supported link.
- Store structured decision provenance—evidence, freshness, applicable deterministic rules, objective/policy, authorization, selected action, transition history, and outcome—without storing hidden model chain-of-thought.

### 3. Working user experience

Build a cohesive responsive workspace with a persistent navigation rail and screens for:

- **Overview:** recent events/changes, obligations requiring attention, unresolved evidence conflicts, stale-information notices, and actions awaiting review. Every attention signal must have a visible deterministic reason and link to its evidence/record.
- **Entities and relationships:** create and inspect operational entities; add time-bounded relationships; inspect linked observations and history; record an explicit correction or identity decision without erasing prior evidence.
- **Obligations:** capture commitments with owner, due date, optional amount/currency, source/evidence, status, and history. Use deterministic due-soon/overdue rules; do not invent priorities or financial state.
- **Evidence and observations:** enter a manual observation with source label, observed time, optional valid period, confidence/quality, notes, and linked entity/obligation. Preserve provenance and make stale/conflicting/unknown states visible. Start without third-party sync; describe manual capture as the actual available input path.
- **Actions:** create a proposed internal follow-up/reminder linked to an obligation or event; show who proposed it, the rule/evidence, required approver, and lifecycle. Enforce propose → authorized/rejected → submitted/executing → confirmed/failed/expired/unknown transitions with an append-only event record. The only executable first-release action is an internal, reversible workspace follow-up. Confirm it only after its corresponding workspace record is actually persisted; financial transfers, messages, and all external actions remain unavailable and are not simulated. A timeout/indeterminate result remains `unknown`.
- **Settings/data sources:** manage workspace membership/roles and show integrations as unconnected with no implication that a sync occurred.

An empty account starts empty. Offer an explicit, removable/clearly labelled **load illustrative sample workspace** option for exploring the interface; sample records must remain marked as illustrative and must never appear as observed live data by default.

### 4. Deterministic intelligence and recovery

Use small server-side rules rather than an LLM for the first release: due dates approaching/past, stale observations according to a stated default, unresolved conflicts, incomplete evidence, and actions awaiting approval or with an unknown outcome. Keep rules and thresholds inspectable and make their reasons explainable. Human corrections create new evidence/history. Design mutations to handle duplicate requests and safe retries where appropriate; contain failures and return honest unresolved states. No continuous polling, background scheduler, external connector, or AI capability is in scope yet.

### 5. Visual identity

Before application code, create `/home/ubuntu/operant/ideas.md` with three concise, distinct design hypotheses and select one coherent direction, then expand its color, layout, interaction, typography, voice, and brand rules. Create an original simple project-specific flat logo/icon and use it consistently in the header and website favicon. Register a durable uploaded HTTPS logo URL as a quoted literal in root `app.config.ts` before the first application checkpoint. Do not reuse the watermarked image-search results as product artwork; this functional dashboard does not need decorative stock imagery.

## Project structure and responsibilities

- `client/src/pages/`: route-level overview, entity, obligation, action, evidence, and settings experiences.
- `client/src/components/`: shared navigation, record/evidence panels, status/freshness/conflict badges, and action review controls.
- `client/src/`: app routing, styling, and typed tRPC client integration.
- `server/routers.ts` plus a focused operational router/module: authenticated tRPC procedures and input validation.
- `server/`: scoped query/mutation helpers; keep database access separate from UI and policy checks.
- `drizzle/schema.ts`, additive migration files, and relations: persisted domain model, temporal fields, and audit/event history.
- `shared/`: shared enums and serializable domain types where useful.
- `client/public/manus-routes.json`: exact page-route declaration, updated whenever routes change.
- Root `ideas.md` and `app.config.ts`: design direction and platform brand metadata.

## Execution sequence after approval

1. Write the design brief and create the logo/favicon; register its durable logo metadata.
2. Create the complete route manifest; verify initial runtime/diagnostic state and retain the initialized dependencies.
3. Add domain schemas and an additive migration; implement workspace creation/membership and permission-scoped persistence.
4. Add evidence, observation, entity, relationship, obligation, event, policy, action, and audit procedures with strict validation and safe lifecycle transitions.
5. Build the responsive pages and connect them to real authenticated API results, including empty states and explicitly opt-in illustrative data.
6. Implement deterministic attention rules and internal follow-up action execution/confirmation; leave external integrations visibly unavailable.
7. Run available TypeScript diagnostics, `pnpm check`, existing tests, and targeted new tests; verify health, manifest, and representative real API response parsing. Start the Preview server only after route manifest and code are ready.
8. Perform the required independent, read-only validator review of how the frontend, API, database, permissions, and action lifecycle connect; correct confirmed findings and keep unresolved outcomes open.
9. Save a canonical WebDev checkpoint. Do not claim publication unless an authorized publish operation returns a successful publication receipt; if no publish is performed, deliver the current Preview URL as a preview.

## Verification and acceptance

- TypeScript diagnostics and `pnpm check` report no actionable errors; `pnpm test` and any targeted domain tests pass, with their actual results recorded.
- Add tests for workspace isolation/role checks; preserving old evidence during corrections; conflicting, stale, and unknown knowledge; deterministic attention reasons; action lifecycle and approver enforcement; timeout/unknown handling; and never reporting an external action as completed.
- Check migration diff is additive and does not erase existing user/auth data. Verify new schemas and UI/API types agree and that actual API response shapes parse in the client.
- Confirm `/api/health` and `/manus-routes.json` return successful, accurate responses; inspect relevant running-service/API evidence where feasible. No screenshot or browser-interaction test is planned unless the user later requests it or an observed defect requires it.
- Confirm private workspace data is always scoped to the authenticated member and non-cacheable; confirm sample records are absent until explicitly requested and remain visually identified afterward.
- Independent validation is required because this project entered Plan Mode; record any findings against the affected acceptance outcomes.

## Assumptions and risks

- The desired outcome is the working first product foundation described by the prompt's own initial boundary—not an attempt to implement every future operational domain at once.
- The initialized managed React/Express/tRPC/Drizzle/MySQL environment is an acceptable hosting choice; preserve it and use its configured services. This is a sensitive-data application and is planned as an authenticated workspace, not public content.
- Initial information arrives through user-entered observations only. External APIs/connectors and automated sync require later selection/configuration and are not implied by interface placeholders.
- Initial reasoning is transparent deterministic rules, not generated AI answers. Any later model-assisted inference must remain separately labelled, evidence-linked, uncertain when appropriate, and unable to bypass permissions.
- No consequential external action (payment, message, account change, official record) is automated in this release. Internal follow-up actions are reversible and recorded; their confirmation is based on persisted records or explicit user evidence.
- Platform OAuth redirect/cookie restrictions may limit preview authentication. The app must preserve real security and report an actual login limitation rather than bypassing it.
- The development and published app share the managed database. Schema work must be additive and migration-safe; never run destructive SQL without separate approval.
