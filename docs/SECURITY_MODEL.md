# Operant Security Model & Threat Assessment

## 1. Zero-Trust Architecture Principles

1. **Explicit Identity Verification:** Users and workers must authenticate every RPC and webhook transaction. No implicit ambient trust is granted across services.
2. **Deterministic Governance (Two-Man Rule):** Autonomous intelligence agents can propose actions but are structurally precluded from executing mutations directly against external providers or altering world state without explicit manager authorization.
3. **Multi-Tenant Referential Isolation:** Workspace boundaries are enforced not merely via query filters, but through composite database foreign keys `(workspace_id, id)` and strict database constraints with `ON DELETE RESTRICT`.

---

## 2. Threat Vector Mitigations

### 2.1 Replay Attacks and Webhook Tampering
- **Mitigation:** Inbound webhooks require raw-body HMAC-SHA256 signature verification prior to JSON parsing. Persisted payloads compute a deterministic SHA-256 hash. The inbox table enforces unique constraints on `(workspace_id, provider, payload_hash)`, rejecting replay attempts at the storage engine level.

### 2.2 Split-Brain Worker Collisions
- **Mitigation:** Distributed workers do not maintain shared in-memory state. Lease claims use database row locks (`SELECT ... FOR UPDATE`) with bounded durations and randomized jitter:
$$t_{\text{lease}} = t_{\text{base}} + \text{rand}(0, \Delta_{\text{jitter}})$$
Fencing tokens verify that expired leases cannot commit state transitions.

### 2.3 CSRF and Origin Spoofing
- **Mitigation:** State-mutating routes require cryptographically signed CSRF tokens bound to the authenticated session ID. Same-origin headers (`Origin`, `Sec-Fetch-Site`) are verified on all POST/PUT/DELETE requests.

### 2.4 Prompt Injection and Ungrounded Actions
- **Mitigation:** LLM outputs are treated as untrusted user input. Proposed actions undergo strict JSON schema validation and deterministic citation checks. Every cited assertion must exist in active valid time within the workspace. Actions referencing conflicting or ungrounded assertions are rejected immediately.

### 2.5 Credential Storage
- **Mitigation:** Provider API tokens and webhook secrets are encrypted at rest using AES-256-GCM with authenticated tags. Encryption keys are sourced strictly from environment secrets and never committed to source control, logs, or client responses.
