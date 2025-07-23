import { useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, ArrowRight, BadgeCheck, CircleCheck, Clock3, FileCheck2, Plus, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { EmptyState, FormField, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";
import GitHubActionControls from "@/components/GitHubActionControls";

const statusTone = (status: string) => {
  if (status === "confirmed") return "good" as const;
  if (status === "proposed" || status === "authorized" || status === "submitted" || status === "executing") return "warn" as const;
  if (status === "unknown" || status === "failed" || status === "expired" || status === "rejected") return "bad" as const;
  return "info" as const;
};
const lifecycle = ["proposed", "authorized", "submitted", "executing", "confirmed"];

export default function Actions() {
  const { workspace, workspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const actionData = trpc.operant.actions.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled, refetchOnWindowFocus: true });
  const obligations = trpc.operant.records.obligations.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const events = trpc.operant.records.events.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const evidence = trpc.operant.records.evidence.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const members = trpc.operant.workspace.members.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const settings = trpc.operant.intelligence.settings.get.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = workspace?.role === "owner" || workspace?.role === "admin";
  const isReadOnly = Boolean(workspace?.isIllustrative) || workspace?.role === "viewer";
  const refresh = async () => { await utils.operant.actions.list.invalidate(); await utils.operant.intelligence.summary.invalidate(); await utils.operant.records.events.invalidate(); };
  const proposal = trpc.operant.actions.propose.useMutation({ onSuccess: async () => { setShowForm(false); setMessage("Proposal recorded. It has not been executed."); await refresh(); } });
  const authorize = trpc.operant.actions.authorize.useMutation({ onSuccess: async () => { setMessage("Authorization recorded. Execution remains a separate step."); await refresh(); } });
  const reject = trpc.operant.actions.reject.useMutation({ onSuccess: async () => { setMessage("Rejection recorded in the action history."); await refresh(); } });
  const execute = trpc.operant.actions.execute.useMutation({ onSuccess: async (result) => { setMessage(result.alreadyExecuted ? "The existing verified follow-up was returned; no duplicate was created." : "Internal follow-up persisted and verified."); await refresh(); await utils.operant.actions.list.refetch(); }, onError: async (error) => { setMessage(error.message); await refresh(); } });
  const recordUnknown = trpc.operant.actions.recordUnknown.useMutation({ onSuccess: async () => { setMessage("The outcome is recorded as unknown. No success was claimed."); await refresh(); } });
  const reconcile = trpc.operant.actions.reconcileUnknown.useMutation({ onSuccess: async (result) => { setMessage(result.resolved ? "Outcome reconciled against the persisted follow-up record." : result.reason || "The outcome remains unknown; no retry was made."); await refresh(); } });
  const complete = trpc.operant.actions.completeFollowUp.useMutation({ onSuccess: async () => { setMessage("Follow-up completion recorded."); await refresh(); } });
  const actions = (actionData.data?.actions ?? []).filter((item) => item.actionType === "internal_follow_up");
  const followUps = actionData.data?.followUps ?? [];
  const history = actionData.data?.history ?? [];
  const evaluationByAction = useMemo(() => new Map((actionData.data?.evaluations ?? []).map((item) => [item.actionId, item])), [actionData.data?.evaluations]);
  const memberNames = useMemo(() => new Map((members.data ?? []).map((item) => [item.userId, item.name || item.email || `Member #${item.userId}`])), [members.data]);
  const obligationById = useMemo(() => new Map((obligations.data ?? []).map((item) => [item.id, item])), [obligations.data]);
  const eventById = useMemo(() => new Map((events.data ?? []).map((item) => [item.id, item])), [events.data]);
  const evidenceById = useMemo(() => new Map((evidence.data?.records ?? []).map((item) => [item.id, item])), [evidence.data]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || isReadOnly) return;
    const form = new FormData(event.currentTarget);
    const obligationId = String(form.get("obligationId") || "");
    const eventId = String(form.get("eventId") || "");
    const evidenceId = String(form.get("evidenceId") || "");
    const objectiveId = String(form.get("objectiveId") || "");
    const dueAt = String(form.get("dueAt") || "");
    if (Boolean(obligationId) === Boolean(eventId)) {
      setMessage("Link the proposal to exactly one obligation or operational event before recording it.");
      return;
    }
    setMessage(null);
    proposal.mutate({ workspaceId, title: String(form.get("title")), description: String(form.get("description") || ""), obligationId: obligationId ? Number(obligationId) : undefined, eventId: eventId ? Number(eventId) : undefined, evidenceId: evidenceId ? Number(evidenceId) : undefined, objectiveId: objectiveId ? Number(objectiveId) : undefined, dueAt: dueAt ? new Date(dueAt) : undefined });
  };

  return <>
    <PageHeader eyebrow="CONTROLLED EXECUTION" title="Actions" subtitle="Proposals are not actions. Every authorization, external write and verified outcome is a separate, recorded step." actions={!isReadOnly && <button className="button button-primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> Propose follow-up</button>} />
    <div className="notice-strip"><ShieldCheck size={17} /><div><strong>Internal follow-ups and GitHub comments have distinct execution paths.</strong><span>Local follow-ups require owner/admin authorization before persistence. Public GitHub comments require a separate exact-hash approval, explicit send, and independent read-back.</span></div></div>
    {workspace?.isIllustrative && <div className="sample-readonly-note"><Activity size={15} /> Example proposals are read-only and have not been executed.</div>}
    {showForm && !isReadOnly && <Panel className="form-panel"><div className="form-panel-heading"><div><div className="eyebrow">PROPOSAL ONLY</div><h2>Propose an internal follow-up</h2><p>Nothing is sent externally. Link an obligation or event. This is a manual proposal, not an automated rule; an owner/admin must authorize it before a workspace task can be created.</p></div><button className="icon-button" aria-label="Close form" onClick={() => setShowForm(false)}><X size={17} /></button></div><form className="form-grid" onSubmit={submit}>
      <FormField label="Follow-up title"><input name="title" required maxLength={220} placeholder="What should a workspace member review or do?" /></FormField>
      <FormField label="Rationale"><input name="description" maxLength={5000} placeholder="Why is this follow-up proposed?" /></FormField>
      <FormField label="Related obligation"><select name="obligationId" defaultValue=""><option value="">Not linked</option>{(obligations.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField>
      <FormField label="Related operational event"><select name="eventId" defaultValue=""><option value="">Not linked</option>{(events.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.eventType.replace(/[._]/g, " ")} · {item.summary}</option>)}</select></FormField>
      <FormField label="Supporting evidence"><select name="evidenceId" defaultValue=""><option value="">Not linked</option>{(evidence.data?.records ?? []).map((item) => <option key={item.id} value={item.id}>{item.sourceName} · {item.claim.slice(0, 70)}</option>)}</select></FormField>
      <FormField label="Objective (optional)" hint="Only an objective you explicitly select is attached to this proposal."><select name="objectiveId" defaultValue=""><option value="">No objective selected</option>{(settings.data?.objectives ?? []).filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.priority}</option>)}</select></FormField>
      <FormField label="Follow-up due date"><input name="dueAt" type="date" /></FormField>
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={proposal.isPending}>{proposal.isPending ? "Proposing…" : "Record proposal"}</button><button className="button button-quiet" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
    </form>{proposal.error && <div className="inline-error">{proposal.error.message}</div>}</Panel>}

    {message && <div className="success-message"><BadgeCheck size={15} /> {message}</div>}
    {actionData.error && <div className="inline-error page-error">Could not load action history: {actionData.error.message}</div>}
    {actionData.isLoading && <div className="skeleton-panel"><div /><div /><div /></div>}
    {!actionData.isLoading && actions.length === 0 && <Panel><EmptyState icon={Activity} title="No actions proposed" detail="Create a reversible, in-workspace follow-up. Approval and local persistence are explicit; nothing external can run here." action={!isReadOnly && <button className="button button-secondary" onClick={() => setShowForm(true)}><Plus size={15} /> Propose the first follow-up</button>} /></Panel>}

    {actions.length > 0 && <div className="action-list">{actions.map((item) => {
      const timeline = history.filter((entry) => entry.actionId === item.id).slice().reverse();
      const followUp = followUps.find((entry) => entry.actionId === item.id);
      const linkedObligation = item.obligationId ? obligationById.get(item.obligationId) : undefined;
      const linkedEvent = item.eventId ? eventById.get(item.eventId) : undefined;
      const linkedEvidence = item.evidenceId ? evidenceById.get(item.evidenceId) : undefined;
      const decision = item.decisionProvenance;
      const evaluation = evaluationByAction.get(item.id);
      const stepIndex = lifecycle.indexOf(item.status);
      const needsApproval = item.status === "proposed";
      const isUnknown = item.status === "unknown";
      return <Panel className="action-card" id={`action-${item.id}`} key={item.id}>
        <div className="action-card-head"><div className="action-kind-mark"><Activity size={17} /></div><div className="action-heading"><div className="action-title-row"><h2>{item.title}</h2><StatusChip tone={statusTone(item.status)}>{item.status}</StatusChip></div><p>{item.description || "No additional rationale recorded."}</p></div><span className="action-reference">A-{String(item.id).padStart(4, "0")}</span></div>
        <div className="action-provenance"><span><UserRound size={14} /> Proposed by {memberNames.get(item.proposedBy) || `member #${item.proposedBy}`}</span>{item.authorizedBy && <span><ShieldCheck size={14} /> Authorized by {memberNames.get(item.authorizedBy) || `member #${item.authorizedBy}`}</span>}<span>Basis · {decision?.basis === "illustrative" ? "Explicitly loaded illustrative sample; not live member activity" : decision ? "Manual proposal; not generated or executed automatically" : "Provenance snapshot unavailable; no basis is inferred"}</span><span className="approval-note"><ShieldCheck size={14} /> Required approver · workspace owner/admin</span>{linkedObligation && <span>Obligation · {linkedObligation.title}</span>}{linkedEvent && <span>Event · {linkedEvent.summary}</span>}{linkedEvidence && <span><FileCheck2 size={14} /> Evidence · {linkedEvidence.sourceName}</span>}</div>
        {decision && <details className="history-details"><summary><FileCheck2 size={14} /> Decision snapshot · {new Date(decision.capturedAt).toLocaleString()}</summary><div className="history-list"><div className="history-row"><strong>Target</strong><p>{decision.target.kind} · {decision.target.label} (#{decision.target.id})</p></div><div className="history-row"><strong>Objective at proposal</strong><p>{decision.objective ? `${decision.objective.title} · ${decision.objective.priority}` : "No objective selected; none was assumed."}</p></div><div className="history-row"><strong>Policy at proposal</strong><p>Due-soon window: {decision.policySnapshot.dueSoonDays} calendar days · Evidence freshness threshold: {decision.policySnapshot.staleAfterDays} days.</p></div>{decision.evidence && <div className="history-row"><strong>Evidence snapshot · #{decision.evidence.id}</strong><p>{decision.evidence.sourceName} · authority {decision.evidence.sourceAuthority} · quality {decision.evidence.qualityState} · confidence {decision.evidence.confidence}% · observed {new Date(decision.evidence.observedAt).toLocaleString()} · age {decision.evidence.ageDaysAtCapture} days.</p></div>}{decision.rules.map((rule) => <div className="history-row" key={rule.id}><span><strong>{rule.id.replaceAll("_", " ")}</strong> · {rule.result}</span><p>{rule.reason}</p></div>)}<div className="history-row"><strong>Selected internal action</strong><p>{decision.selectedAction.title}{decision.selectedAction.dueAt ? ` · due ${new Date(decision.selectedAction.dueAt).toLocaleDateString()}` : " · no due date"}. Manual proposal; this snapshot does not imply that a rule created or executed it.</p></div></div></details>}
        {evaluation && <details className="history-details"><summary><ShieldCheck size={14} /> Structured evaluation · {evaluation.riskLevel} risk · {evaluation.approvalRequired ? "approval required" : "no approval required"}</summary><div className="history-list"><div className="history-row"><strong>Actor & authority at proposal</strong><p>Member #{evaluation.actorId} · {evaluation.actorRole}; required approver role: {evaluation.requiredRole} (workspace owner/admin).</p></div><div className="history-row"><strong>Risk rationale</strong><p>{evaluation.rationale}</p></div><div className="history-row"><strong>Scope, objective & responsibility snapshot</strong><pre>{JSON.stringify(evaluation.scopeSnapshot, null, 2)}</pre></div><div className="history-row"><strong>Policy & rule snapshot</strong><pre>{JSON.stringify(evaluation.policySnapshot, null, 2)}</pre></div></div></details>}
        {item.outcome && <div className={`action-outcome ${isUnknown ? "action-outcome-unknown" : ""}`}><strong>{isUnknown ? "Unresolved outcome" : item.status === "confirmed" ? "Persisted result" : "Recorded outcome"}</strong><span>{item.outcome}</span></div>}
        {stepIndex >= 0 && <div className="lifecycle">{lifecycle.map((step, index) => <div className={`lifecycle-step ${index <= stepIndex ? "step-done" : ""} ${step === item.status ? "step-current" : ""}`} key={step}><span>{index < stepIndex ? <CircleCheck size={14} /> : index + 1}</span><small>{step}</small></div>)}</div>}
        {timeline.length > 0 && <details className="history-details"><summary><Clock3 size={14} /> {timeline.length} recorded state {timeline.length === 1 ? "change" : "changes"}</summary><div className="history-list">{timeline.map((event) => <div className="history-row" key={event.id}><span><strong>{event.toState}</strong> by {memberNames.get(event.actorId) || `member #${event.actorId}`}</span><small>{new Date(event.createdAt).toLocaleString()}</small>{event.note && <p>{event.note}</p>}</div>)}</div></details>}
        {needsApproval && canManage && !isReadOnly && <div className="action-controls"><span className="approval-note"><ShieldCheck size={14} /> Owner/admin approval required</span><div><button className="button button-secondary button-small" disabled={authorize.isPending} onClick={() => authorize.mutate({ workspaceId: workspaceId!, actionId: item.id })}>Authorize</button><button className="text-button text-danger" onClick={() => { const reason = window.prompt("Reason for rejecting this proposed follow-up?"); if (reason && reason.trim().length >= 3) reject.mutate({ workspaceId: workspaceId!, actionId: item.id, reason: reason.trim() }); }}>Reject</button></div></div>}
        {item.status === "authorized" && canManage && !isReadOnly && <div className="action-controls"><span className="approval-note"><CircleCheck size={14} /> Authorized; execution remains a separate explicit step.</span><button className="button button-primary button-small" disabled={execute.isPending} onClick={() => execute.mutate({ workspaceId: workspaceId!, actionId: item.id })}><Activity size={14} /> {execute.isPending ? "Creating…" : "Create follow-up"}</button></div>}
        {(item.status === "executing" || item.status === "submitted") && canManage && !isReadOnly && <div className="action-controls"><span className="approval-note"><Clock3 size={14} /> Result is not yet confirmed.</span><button className="button button-secondary button-small" onClick={() => { const reason = window.prompt("Why can’t the result currently be verified?"); if (reason && reason.trim().length >= 3) recordUnknown.mutate({ workspaceId: workspaceId!, actionId: item.id, reason: reason.trim() }); }}><AlertTriangle size={14} /> Record unknown</button></div>}
        {isUnknown && canManage && !isReadOnly && <div className="action-controls"><span className="approval-note approval-note-warn"><AlertTriangle size={14} /> No success is claimed; do not retry automatically.</span><button className="button button-secondary button-small" disabled={reconcile.isPending} onClick={() => reconcile.mutate({ workspaceId: workspaceId!, actionId: item.id })}><RefreshCw size={14} /> Reconcile persisted record</button></div>}
        {followUp && <div className={`follow-up-record ${followUp.status === "completed" ? "follow-up-complete" : ""}`}><span className="followup-check">{followUp.status === "completed" ? <CircleCheck size={15} /> : <Clock3 size={15} />}</span><div><strong>Workspace follow-up #{followUp.id}</strong><small>{followUp.status === "completed" ? `User-reported completion${followUp.completedBy ? ` by ${memberNames.get(followUp.completedBy) || `member #${followUp.completedBy}`}` : ""}${followUp.completedAt ? ` · ${new Date(followUp.completedAt).toLocaleString()}` : ""}` : "Open internal task"}{followUp.dueAt && ` · Due ${new Date(followUp.dueAt).toLocaleDateString()}`}</small></div>{followUp.status === "open" && !isReadOnly && <button className="button button-quiet button-small" disabled={complete.isPending} onClick={() => complete.mutate({ workspaceId: workspaceId!, followUpId: followUp.id })}>Mark complete</button>}</div>}
      </Panel>;
    })}</div>}
    {actions.length > 0 && <div className="bottom-note"><span><ShieldCheck size={15} /></span><span>Internal follow-ups are confirmed only after a persisted workspace record is verified.</span><Link href="/evidence">Evidence <ArrowRight size={13} /></Link></div>}
    <GitHubActionControls />
    {(authorize.error || execute.error || reject.error || recordUnknown.error || reconcile.error || complete.error) && <div className="inline-error">{authorize.error?.message || execute.error?.message || reject.error?.message || recordUnknown.error?.message || reconcile.error?.message || complete.error?.message}</div>}
  </>;
}
