import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CalendarClock, CircleCheck, CircleDollarSign, Clock3, Plus, ReceiptText, ShieldAlert, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { EmptyState, FormField, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";
import { classifyDueDate } from "@shared/dateRules";
import { auditOperationLabel, describeAuditEntry } from "@/lib/recordHistory";

function localDateTime() {
  const now = new Date();
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}
function formatDate(value: Date | string | null | undefined, dateOnly = false) {
  if (!value) return "No due date";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, dateOnly ? { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", year: "numeric" });
}
function dueStatus(dueAt: Date | string | null, status: string, dueSoonDays: number | undefined) {
  if (status !== "open" || !dueAt) return { label: status, tone: status === "satisfied" ? "good" as const : status === "disputed" ? "bad" as const : "neutral" as const };
  if (dueSoonDays === undefined) return { label: "policy unavailable", tone: "neutral" as const };
  const state = classifyDueDate(dueAt, status, dueSoonDays);
  if (state === "overdue") return { label: "overdue", tone: "bad" as const };
  if (state === "due_soon") return { label: "due soon", tone: "warn" as const };
  return { label: "open", tone: "info" as const };
}

export default function Obligations() {
  const { workspace, workspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const obligations = trpc.operant.records.obligations.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const entities = trpc.operant.records.entities.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const evidence = trpc.operant.records.evidence.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const summary = trpc.operant.intelligence.summary.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const history = trpc.operant.records.history.useQuery({ workspaceId: workspaceId ?? 0, recordType: "obligation" }, { enabled });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<Record<number, string>>({});
  const create = trpc.operant.records.obligations.create.useMutation({ onSuccess: async () => { setShowForm(false); await utils.operant.records.obligations.list.invalidate(); await utils.operant.intelligence.summary.invalidate(); await utils.operant.records.events.invalidate(); await utils.operant.records.evidence.list.invalidate(); await utils.operant.records.history.invalidate(); } });
  const updateStatus = trpc.operant.records.obligations.updateStatus.useMutation({ onSuccess: async () => { await utils.operant.records.obligations.list.invalidate(); await utils.operant.intelligence.summary.invalidate(); await utils.operant.records.events.invalidate(); await utils.operant.records.history.invalidate(); } });
  const records = obligations.data ?? [];
  const dueSoonDays = summary.error ? undefined : summary.data?.policies.dueSoonDays;
  const evidenceMap = useMemo(() => new Map((evidence.data?.records ?? []).map((item) => [item.id, item])), [evidence.data]);
  const entityName = (id: number | null) => id ? entities.data?.find((item) => item.id === id)?.displayName ?? `Entity #${id}` : "Owner not assigned";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || workspace?.isIllustrative) return;
    const form = new FormData(event.currentTarget);
    const dueAt = String(form.get("dueAt") || "");
    const amount = String(form.get("amount") || "");
    const owner = String(form.get("ownerEntityId") || "");
    const counterparty = String(form.get("counterpartyEntityId") || "");
    create.mutate({
      workspaceId,
      title: String(form.get("title")),
      description: String(form.get("description") || ""),
      ownerEntityId: owner ? Number(owner) : undefined,
      counterpartyEntityId: counterparty ? Number(counterparty) : undefined,
      dueAt: dueAt ? new Date(dueAt) : undefined,
      amount: amount || undefined,
      currency: amount ? String(form.get("currency") || "USD") : undefined,
      sourceName: String(form.get("sourceName")),
      sourceAuthority: String(form.get("sourceAuthority")) as "unknown" | "reported" | "direct" | "official",
      evidenceClaim: String(form.get("evidenceClaim")),
      observedAt: new Date(String(form.get("observedAt"))),
    });
  };

  return <>
    <PageHeader eyebrow="COMMITMENTS & RESOURCES" title="Obligations" subtitle="Commitments with owners, due dates, amounts, sources, and a recoverable state history." actions={!workspace?.isIllustrative && <button className="button button-primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> Add obligation</button>} />
    <div className="notice-strip notice-strip-gold"><CalendarClock size={17} /><div><strong>Due dates are rules, not priorities.</strong><span>{summary.error ? "Due-date policy is unavailable; urgency is not classified against a default. " : summary.data ? `The configured due-soon window is ${summary.data.policies.dueSoonDays} calendar days, including today. ` : "Loading the workspace due-date policy. "}Date-only deadlines remain current through their named UTC calendar day. Operant does not decide which commitment matters most to you.</span></div></div>
    {workspace?.isIllustrative && <div className="sample-readonly-note"><ReceiptText size={15} /> Example obligations are illustrative and cannot be edited or marked satisfied.</div>}

    {showForm && !workspace?.isIllustrative && <Panel className="form-panel"><div className="form-panel-heading"><div><div className="eyebrow">NEW COMMITMENT</div><h2>Record an obligation</h2><p>Each obligation gets an attributable source-evidence record.</p></div><button className="icon-button" aria-label="Close form" onClick={() => setShowForm(false)}><X size={17} /></button></div>
      <form className="form-grid" onSubmit={submit}>
        <FormField label="Obligation"><input name="title" required maxLength={220} placeholder="What is due or committed?" /></FormField>
        <FormField label="Description"><input name="description" maxLength={5000} placeholder="Relevant terms or context" /></FormField>
        <FormField label="Owner"><select name="ownerEntityId" defaultValue=""><option value="">Unassigned</option>{(entities.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></FormField>
        <FormField label="Counterparty"><select name="counterpartyEntityId" defaultValue=""><option value="">Not recorded</option>{(entities.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></FormField>
        <FormField label="Due date"><input name="dueAt" type="date" /></FormField>
        <div className="form-inline-fields"><FormField label="Amount"><input name="amount" type="number" min="0" step="0.01" placeholder="0.00" /></FormField><FormField label="Currency"><select name="currency" defaultValue="USD"><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option><option>INR</option></select></FormField></div>
        <FormField label="Source label"><input name="sourceName" required maxLength={200} defaultValue="User entry" placeholder="Invoice, contract, email…" /></FormField>
        <FormField label="Source authority" hint="Your classification; not independently verified."><select name="sourceAuthority" defaultValue="unknown"><option value="unknown">Unknown</option><option value="reported">Reported by a person or organization</option><option value="direct">Direct source material</option><option value="official">Official record (not independently verified)</option></select></FormField>
        <FormField label="Source statement"><input name="evidenceClaim" required maxLength={5000} placeholder="What does the source state about this obligation?" /></FormField>
        <FormField label="Observed at"><input name="observedAt" type="datetime-local" defaultValue={localDateTime()} required /></FormField>
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? "Recording…" : "Save obligation"}</button><button className="button button-quiet" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
      </form>
      {create.error && <div className="inline-error">{create.error.message}</div>}
    </Panel>}

    <div className="obligation-summary-row"><span><strong>{records.filter((item) => item.status === "open").length}</strong> open</span><span><strong>{records.filter((item) => item.status === "satisfied").length}</strong> satisfied with evidence</span><span><strong>{records.filter((item) => item.status === "disputed").length}</strong> disputed</span></div>
    {obligations.error && <div className="inline-error page-error">Could not load obligations: {obligations.error.message}</div>}
    {history.error && <div className="inline-error page-error">Could not load obligation history: {history.error.message}</div>}
    {!obligations.isLoading && records.length === 0 && <Panel><EmptyState icon={ReceiptText} title="No obligations recorded" detail="Capture commitments as operational records, preserving their source instead of treating a due date as a hidden assumption." action={!workspace?.isIllustrative && <button className="button button-secondary" onClick={() => setShowForm(true)}><Plus size={15} /> Record a commitment</button>} /></Panel>}
    {obligations.isLoading && <div className="skeleton-panel"><div /><div /><div /></div>}

    {summary.error && <div className="inline-error page-error">Could not load the workspace due-date policy; open items are not classified against a default.</div>}
    {records.length > 0 && <div className="obligation-list">{records.map((item) => {
      const state = dueStatus(item.dueAt, item.status, dueSoonDays);
      const source = item.evidenceId ? evidenceMap.get(item.evidenceId) : undefined;
      const recordHistory = (history.data?.records ?? []).filter((entry) => entry.recordId === item.id).slice(0, 8);
      return <Panel className="obligation-card" id={`obligation-${item.id}`} key={item.id}>
        <div className="obligation-card-main"><div className="obligation-date-block"><span>{item.dueAt ? new Date(item.dueAt).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) : "—"}</span><strong>{item.dueAt ? new Date(item.dueAt).getUTCDate() : "—"}</strong><small>{item.dueAt ? new Date(item.dueAt).getUTCFullYear() : "No date"}</small></div><div className="obligation-copy"><div className="obligation-title-row"><h2>{item.title}</h2><StatusChip tone={state.tone}>{state.label}</StatusChip></div><p>{item.description || "No additional terms recorded."}</p><div className="obligation-meta"><span>Owner · {entityName(item.ownerEntityId)}</span>{item.counterpartyEntityId && <span>Counterparty · {entityName(item.counterpartyEntityId)}</span>}<span>Due · {formatDate(item.dueAt, true)}</span><span>Recorded · {formatDate(item.createdAt)}</span>{source && <span>Source · {source.sourceName}</span>}</div>{source && <div className="source-claim"><span>Recorded evidence</span><span>{source.claim}</span><Link href={`/evidence#evidence-${source.id}`}>Review source <ArrowRight size={13} /></Link></div>}</div>
          {item.amount !== null && <div className="obligation-amount"><small>Recorded amount</small><strong><CircleDollarSign size={16} />{item.currency || ""} {item.amount}</strong><span>Source-linked</span></div>}
        </div>
        {item.status === "open" && !workspace?.isIllustrative && <div className="obligation-actions"><label className="evidence-select"><span>Completion evidence</span><select value={selectedEvidence[item.id] ?? ""} onChange={(event) => setSelectedEvidence((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Select an evidence record…</option>{(evidence.data?.records ?? []).map((record) => <option key={record.id} value={record.id}>{record.sourceName} · {record.claim.slice(0, 70)}</option>)}</select></label><button className="button button-secondary button-small" disabled={!selectedEvidence[item.id] || updateStatus.isPending} onClick={() => updateStatus.mutate({ workspaceId: workspaceId!, obligationId: item.id, status: "satisfied", completionEvidenceId: Number(selectedEvidence[item.id]) })}><CircleCheck size={14} /> Mark satisfied</button><button className="text-button" onClick={() => updateStatus.mutate({ workspaceId: workspaceId!, obligationId: item.id, status: "disputed" })}>Mark disputed</button></div>}
        {recordHistory.length > 0 && <details className="history-details"><summary><Clock3 size={14} /> Record history ({recordHistory.length})</summary><div className="history-list">{recordHistory.map((entry) => <div className="history-row" key={entry.id}><span><strong>{auditOperationLabel(entry.operation)}</strong> by {entry.actorId ? `member #${entry.actorId}` : "unknown member"}</span><small>{new Date(entry.createdAt).toLocaleString()}</small><p>{describeAuditEntry(entry.operation, entry.details)}</p></div>)}</div></details>}
        {item.status === "satisfied" && <div className="obligation-confirmation"><CircleCheck size={14} /> Satisfaction is linked to evidence #{item.completionEvidenceId ?? "unknown"}; review the source before relying on it.</div>}
        {!workspace?.isIllustrative && item.status === "open" && !evidence.data?.records.length && <div className="obligation-help">Add source evidence before marking this obligation satisfied. <Link href="/evidence">Record evidence <ArrowRight size={13} /></Link></div>}
      </Panel>;
    })}</div>}
    {updateStatus.error && <div className="inline-error">Could not update the obligation: {updateStatus.error.message}</div>}
    <div className="bottom-note"><span><ShieldAlert size={15} /></span><span>“Satisfied” requires linked evidence; a changed status alone is not verification.</span><Link href="/evidence">Review evidence <ArrowRight size={13} /></Link></div>
  </>;
}
