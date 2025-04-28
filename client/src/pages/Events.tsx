import { useState } from "react";
import { AlertTriangle, Clock3, Database, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmptyState, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";

function tone(status: string) {
  if (status === "processed") return "good" as const;
  if (status === "queued" || status === "processing") return "warn" as const;
  if (status === "retryable_failure" || status === "dead_letter") return "bad" as const;
  return "neutral" as const;
}
function attemptTone(outcome: string) {
  if (outcome === "succeeded") return "good" as const;
  if (outcome === "started" || outcome === "retry_scheduled") return "warn" as const;
  if (outcome === "dead_letter") return "bad" as const;
  return "neutral" as const;
}
function when(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function Events() {
  const { workspace, workspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const events = trpc.operant.events.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled, refetchOnWindowFocus: true });
  const health = trpc.operant.events.health.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const attempts = trpc.operant.events.attempts.useQuery({ workspaceId: workspaceId ?? 0, eventId: selectedId ?? 0 }, { enabled: enabled && selectedId !== null });
  const utils = trpc.useUtils();
  const canManage = workspace?.role === "owner" || workspace?.role === "admin";
  const replay = trpc.operant.events.replay.useMutation({ onSuccess: async (result) => { await Promise.all([utils.operant.events.list.invalidate(), utils.operant.events.health.invalidate(), utils.operant.events.attempts.invalidate()]); setSelectedId(null); setMessage(`Replay was requested. Current status: ${result.status}.`); } });
  const retryWorker = trpc.operant.events.registerRetrySchedule.useMutation({ onSuccess: async (result) => { setMessage(`Durable retry worker is registered on a one-minute cadence${result.nextExecutionAt ? `; next run ${when(result.nextExecutionAt)}` : ""}.`); await utils.operant.events.health.invalidate(); } });

  return <>
    <PageHeader eyebrow="DURABLE INGESTION" title="Events" subtitle="Workspace-scoped inbox with idempotent delivery, worker leases, bounded retries and an auditable replay path." actions={<button className="button button-secondary button-small" onClick={() => { void events.refetch(); void health.refetch(); }}><RefreshCw size={14} /> Refresh</button>} />
    {message && <div className="success-message"><ShieldCheck size={14} /> {message}</div>}
    {workspace?.isIllustrative && <div className="sample-readonly-note"><ShieldCheck size={15} /> Sample data is illustrative and read-only. No replay will be available here.</div>}
    <div className="metric-grid event-metrics">
      <Panel className="metric-card"><span className="metric-icon"><Clock3 size={16} /></span><small>Queued</small><strong>{health.data?.queued ?? "—"}</strong><span>Awaiting a worker claim</span></Panel>
      <Panel className="metric-card"><span className="metric-icon"><RefreshCw size={16} /></span><small>Processing</small><strong>{health.data?.processing ?? "—"}</strong><span>Lease currently held</span></Panel>
      <Panel className="metric-card"><span className="metric-icon metric-icon-warn"><TriangleAlert size={16} /></span><small>Retryable</small><strong>{health.data?.retryable ?? "—"}</strong><span>Eligible only after backoff</span></Panel>
      <Panel className="metric-card"><span className="metric-icon metric-icon-bad"><AlertTriangle size={16} /></span><small>Dead letter</small><strong>{health.data?.deadLettered ?? "—"}</strong><span>Manager review required</span></Panel>
    </div>
    <Panel className="retry-worker-panel"><div className="retry-worker-copy"><div className="eyebrow">DURABLE RECOVERY</div><strong>{health.data?.retryScheduleRegistered ? "Retry schedule registered" : "No retry schedule registered"}</strong><p>Platform Heartbeat checks the persisted inbox every minute. Registration is available only after publication; this status reflects Operant’s saved worker identity.</p></div>{canManage && !workspace?.isIllustrative && health.data?.retryScheduleRegistrationAvailable && <button className="button button-secondary button-small" disabled={retryWorker.isPending} onClick={() => retryWorker.mutate({ workspaceId: workspaceId! })}><RefreshCw size={13} /> {retryWorker.isPending ? "Checking platform…" : health.data.retryScheduleRegistered ? "Reconcile retry worker" : "Register retry worker"}</button>}</Panel>
    <Panel className="event-inbox-panel"><div className="panel-heading"><div><div className="eyebrow">INBOX · LATEST 100</div><h2>Delivery and processing ledger</h2></div><span className="settings-mark"><Database size={17} /></span></div>
      <p className="panel-intro">Payload bodies are not returned to this list. Each row shows an idempotency hash and correlation ID; inspect a specific event’s attempt history before replay.</p>
      {events.isLoading ? <div className="empty-small">Loading inbox…</div> : events.error ? <div className="inline-error">{events.error.message}</div> : (events.data?.length ?? 0) === 0 ? <EmptyState icon={Database} title="No inbox deliveries yet" detail="Connect GitHub in Workspace settings or capture a source-labelled observation on Evidence. Inbound records are saved before processing." /> : <div className="event-list">{events.data!.map((item) => <article className="event-row" key={item.id}>
        <div className="event-row-heading"><div><div className="event-title"><strong>{item.summary}</strong><StatusChip tone={tone(item.status)}>{item.status.replaceAll("_", " ")}</StatusChip></div><small>{item.provider} · {item.eventType}{item.eventAction ? ` · ${item.eventAction}` : ""} · delivery #{item.id}</small></div><time>{when(item.createdAt)}</time></div>
        <div className="event-meta"><span>Attempts <strong>{item.attemptCount}/{item.maxAttempts}</strong></span><span>Next attempt <strong>{when(item.nextAttemptAt)}</strong></span><span>Processed <strong>{when(item.processedAt)}</strong></span><span>Payload SHA-256 <code>{item.payloadHash.slice(0, 16)}…</code></span></div>
        <div className="event-meta"><span>Source <code>{item.sourceExternalId || "manual"}</code></span><span>Correlation <code>{item.correlationId}</code></span>{item.lastErrorClass && <span className="event-error">{item.lastErrorClass}: {item.lastErrorMessage}</span>}</div>
        {item.conflictRefreshIncomplete?.length > 0 && <div className="event-meta"><span className="event-error">Conflict refresh is incomplete for {item.conflictRefreshIncomplete.join(", ")}. Existing conflict status was preserved; do not interpret this result as conflict-free.</span></div>}
        <div className="event-controls"><button className="text-button" onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}>{selectedId === item.id ? "Hide attempt history" : "Inspect attempts"}</button>{(item.status === "retryable_failure" || item.status === "dead_letter") && <button className="button button-secondary button-small" disabled={!canManage || Boolean(workspace?.isIllustrative) || replay.isPending} title={!canManage ? "Owner/admin replay permission required" : undefined} onClick={() => { if (window.confirm(`Replay event #${item.id} (${item.provider} · ${item.eventType}) once from its stored, verified payload? No external write is performed by event replay.`)) replay.mutate({ workspaceId: workspaceId!, eventId: item.id }); }}><RefreshCw size={13} /> Replay failed event</button>}</div>
        {selectedId === item.id && <div className="attempt-panel">{attempts.isLoading ? "Loading attempts…" : attempts.error ? <span className="event-error">{attempts.error.message}</span> : attempts.data?.length ? attempts.data.map((attempt) => <div className="attempt-row" key={attempt.id}><span>Attempt {attempt.attemptNumber}</span><StatusChip tone={attemptTone(attempt.outcome)}>{attempt.outcome.replaceAll("_", " ")}</StatusChip><small>{when(attempt.startedAt)}{attempt.finishedAt ? ` · finished ${when(attempt.finishedAt)}` : ""}</small><span>{attempt.errorClass || "No error class"}{attempt.errorMessage ? ` · ${attempt.errorMessage}` : ""}</span></div>) : <div className="empty-small">No worker attempt has been recorded yet.</div>}</div>}
      </article>)}</div>}
      {(replay.error || retryWorker.error || health.error) && <div className="inline-error">{replay.error?.message || retryWorker.error?.message || health.error?.message}</div>}
      <div className="bottom-note"><span><ShieldCheck size={15} /></span><span>Replay is a manager-controlled recovery operation. It only requeues failed inbox work; external GitHub writes use a separate approval and verification flow.</span>{health.data?.checkedAt && <small>Checked {when(health.data.checkedAt)}</small>}</div>
    </Panel>
  </>;
}
