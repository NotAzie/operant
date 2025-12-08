# Operant API Specification

## 1. Protocol Architecture

Operant exposes a dual interface:
1. **tRPC v11 Router Hierarchy:** Strictly typed, client-to-server RPC protocol for workspace operations, world state querying, and governed action workflows.
2. **REST Endpoints:** Webhook ingestion, health probes, and platform-authenticated scheduled tasks.

---

## 2. tRPC Routers

### 2.1 `world` Router
- `world.getStateAsOf`: Retrieves the reconstructed entity and assertion state for a workspace at `(validTime, knowledgeTime)`.
  - Input: `{ workspaceId: string; asOfValidTime?: string; asOfKnowledgeTime?: string; entityId?: string }`
  - Output: `{ assertions: TemporalInterval[]; conflicts: SweepConflict[]; completeness: 'COMPLETE' | 'TRUNCATED' }`
- `world.getMerkleRoot`: Returns the current cryptographic root hash of the workspace reality tree.
  - Input: `{ workspaceId: string }`
  - Output: `{ root: string; leafCount: number }`
- `world.verifyInclusionProof`: Verifies a cryptographic inclusion proof for a given assertion.
  - Input: `{ workspaceId: string; leafHash: string; proof: MerkleProofElement[]; expectedRoot: string }`
  - Output: `{ verified: boolean }`

### 2.2 `events` Router
- `events.list`: Paginated query over the transactional event inbox.
  - Input: `{ workspaceId: string; limit: number; cursor?: string; status?: 'QUEUED' | 'PROCESSED' | 'DEAD_LETTER' }`
  - Output: `{ items: InboxEvent[]; nextCursor?: string }`
- `events.replayDeadLetter`: Requeues an event from dead-letter state with an incremented attempt limit.
  - Input: `{ workspaceId: string; eventId: string }`
  - Output: `{ replayed: boolean; newAttemptCount: number }`

### 2.3 `actions` Router
- `actions.listPending`: Returns all actions requiring two-man rule approval.
  - Input: `{ workspaceId: string }`
  - Output: `{ actions: PendingAction[] }`
- `actions.approve`: Registers an authorized manager approval for an action payload hash.
  - Input: `{ workspaceId: string; actionId: string; expectedPayloadHash: string }`
  - Output: `{ status: 'APPROVED' | 'REJECTED'; executed: boolean }`
- `actions.executeOneShot`: Executes an approved action with atomic single-use token consumption and provider readback.
  - Input: `{ workspaceId: string; actionId: string }`
  - Output: `{ success: boolean; providerReference: string; verifiedState: unknown }`

---

## 3. REST Ingress Endpoints

### 3.1 `POST /api/webhooks/github/:connectionId`
- **Authentication:** HMAC-SHA256 signature verification over raw request body against the encrypted connection secret.
- **Payload Truncation:** Issue body text capped at 1,500 characters for durable evidence.
- **Idempotency:** SHA-256 payload hash committed to inbox table inside a serializable transaction.

### 3.2 `POST /api/scheduled/events`
- **Authentication:** Platform session token and worker UID verification.
- **Operation:** Leases a bounded batch of queued events using exponential backoff with full jitter.
- **Concurrency:** Uses database-level row locking with random jittered leases to prevent multi-replica worker collision.

### 3.3 `GET /api/health` & `GET /api/ready`
- `/api/health`: 200 OK minimal liveness check.
- `/api/ready`: Readiness probe checking database connectivity, event inbox schema health, and worker schedule registration status. Returns 503 if unavailable.
