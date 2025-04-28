import { useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRightLeft, Clock3, FileCheck2, FilePlus2, ShieldAlert, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { EmptyState, FormField, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";

function localDateTime() {
  const now = new Date();
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function formatDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Unknown time";
}

const authorityLabel = (authority: string) => ({ unknown: "Unknown authority", reported: "Reported source", direct: "Direct source material", official: "Official record" }[authority] ?? authority);

export default function Evidence() {
  const { workspace, workspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const records = trpc.operant.records.evidence.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const entities = trpc.operant.records.entities.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const obligations = trpc.operant.records.obligations.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const summary = trpc.operant.intelligence.summary.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);
  const create = trpc.operant.records.evidence.create.useMutation({ onSuccess: async (result) => { setShowForm(false); idempotency.current = null; setMessage(result.status === "processed" ? result.duplicate ? "This exact evidence submission was already processed; no duplicate record was created." : "Evidence and observation recorded. Prior evidence remains in history." : `Evidence is safely stored in the event inbox (${result.status}); check the Events page for its processing history.`); await utils.operant.records.evidence.list.invalidate(); await utils.operant.intelligence.summary.invalidate(); await utils.operant.records.events.invalidate(); await utils.operant.events.list.invalidate(); await utils.operant.events.health.invalidate(); } });
  const observations = records.data?.observations ?? [];
  const supersededIds = useMemo(() => new Set(observations.map((item) => item.supersedesObservationId).filter((id): id is number => id !== null)), [observations]);
  const conflictIds = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    const current = observations.filter((item) => !supersededIds.has(item.id));
    for (const item of current) {
      const key = `${item.entityId ?? "none"}:${item.attributeKey.toLowerCase()}`;
      const values = groups.get(key) ?? new Set<string>(); values.add(item.value.trim().toLowerCase()); groups.set(key, values);
    }
    const keys = new Set([...groups.entries()].filter(([, values]) => values.size > 1).map(([key]) => key));
    return new Set(current.filter((item) => keys.has(`${item.entityId ?? "none"}:${item.attributeKey.toLowerCase()}`)).map((item) => item.id));
  }, [observations, supersededIds]);
  const entityName = (id: number | null) => id ? entities.data?.find((item) => item.id === id)?.displayName ?? `Entity #${id}` : "No entity linked";
  const obligationName = (id: number | null) => id ? obligations.data?.find((item) => item.id === id)?.title ?? `Obligation #${id}` : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || workspace?.isIllustrative) return;
    const form = new FormData(event.currentTarget);
    const supersedesRaw = String(form.get("supersedesObservationId") || "");
    const entityRaw = String(form.get("entityId") || "");
    const obligationRaw = String(form.get("obligationId") || "");
    const validFromRaw = String(form.get("validFrom") || "");
    const validToRaw = String(form.get("validTo") || "");
    const payload = {
      workspaceId,
      sourceName: String(form.get("sourceName")),
      sourceAuthority: String(form.get("sourceAuthority")) as "unknown" | "reported" | "direct" | "official",
      sourceRef: String(form.get("sourceRef") || "") || undefined,
      claim: String(form.get("claim")),
      observedAt: new Date(String(form.get("observedAt"))),
      validFrom: validFromRaw ? new Date(validFromRaw) : undefined,
      validTo: validToRaw ? new Date(validToRaw) : undefined,
      entityId: entityRaw ? Number(entityRaw) : null,
      obligationId: obligationRaw ? Number(obligationRaw) : null,
      attributeKey: String(form.get("attributeKey")),
      value: String(form.get("value")),
      epistemicState: String(form.get("epistemicState")) as "observed" | "derived" | "inferred" | "predicted",
      qualityState: String(form.get("qualityState")) as "current" | "unknown" | "uncertain" | "incomplete" | "unavailable" | "unresolved" | "stale" | "conflicting",
      confidence: Number(form.get("confidence")),
      supersedesObservationId: supersedesRaw ? Number(supersedesRaw) : undefined,
    };
    const fingerprint = JSON.stringify(payload);
    if (!idempotency.current || idempotency.current.fingerprint !== fingerprint) idempotency.current = { fingerprint, key: crypto.randomUUID() };
    create.mutate({ ...payload, idempotencyKey: idempotency.current.key });
  };

  return <>
    <PageHeader eyebrow="PROVENANCE & OBSERVATIONS" title="Evidence" subtitle="Every important assertion keeps its source, observation time, validity, confidence, and correction history." actions={!workspace?.isIllustrative && <button className="button button-primary" onClick={() => setShowForm((value) => !value)}><FilePlus2 size={16} /> Record observation</button>} />
    <div className="notice-strip"><ShieldAlert size={17} /><div><strong>Evidence is not certainty.</strong><span>Source authority is a user-supplied classification, not an independent verification. Freshness and conflicts are displayed; nothing is promoted to verified fact automatically.</span></div></div>
    {workspace?.isIllustrative && <div className="sample-readonly-note"><FileCheck2 size={15} /> This sample workspace is read-only and all source labels are illustrative.</div>}

    {showForm && !workspace?.isIllustrative && <Panel className="form-panel"><div className="form-panel-heading"><div><div className="eyebrow">MANUAL CAPTURE</div><h2>Record an observation</h2><p>Source, observation, and operational value are stored separately from your interpretation.</p></div><button className="icon-button" aria-label="Close form" onClick={() => setShowForm(false)}><X size={17} /></button></div>
      <form className="form-grid" onSubmit={submit}>
        <FormField label="Source label"><input name="sourceName" required maxLength={200} defaultValue="User entry" placeholder="e.g. invoice, email, conversation" /></FormField>
        <FormField label="Source authority" hint="Classification supplied by you; not independently verified."><select name="sourceAuthority" defaultValue="unknown"><option value="unknown">Unknown</option><option value="reported">Reported by a person or organization</option><option value="direct">Direct source material</option><option value="official">Official record (not independently verified)</option></select></FormField>
        <FormField label="Source reference" hint="Optional account/document identifier; do not paste secrets."><input name="sourceRef" maxLength={240} placeholder="Document ID, invoice number…" /></FormField>
        <FormField label="What the source states"><input name="claim" required maxLength={5000} placeholder="A concise source statement, in your own words" /></FormField>
        <FormField label="Entity"><select name="entityId" defaultValue=""><option value="">No entity linked</option>{(entities.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></FormField>
        <FormField label="Related obligation"><select name="obligationId" defaultValue=""><option value="">No obligation linked</option>{(obligations.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField>
        <FormField label="Attribute / topic"><input name="attributeKey" required maxLength={120} placeholder="e.g. payment_due, address, renewal_date" /></FormField>
        <FormField label="Recorded value"><input name="value" required maxLength={5000} placeholder="The value as represented by the source" /></FormField>
        <FormField label="Observed at"><input name="observedAt" type="datetime-local" defaultValue={localDateTime()} required /></FormField>
        <FormField label="Valid from"><input name="validFrom" type="date" /></FormField>
        <FormField label="Valid until"><input name="validTo" type="date" /></FormField>
        <FormField label="Knowledge state"><select name="epistemicState" defaultValue="observed"><option value="observed">Observed directly</option><option value="derived">Derived deterministically</option><option value="inferred">Inferred, not observed</option><option value="predicted">Predicted, not observed</option></select></FormField>
        <FormField label="Information quality"><select name="qualityState" defaultValue="current"><option value="current">Current (not independently verified)</option><option value="unknown">Unknown</option><option value="uncertain">Uncertain</option><option value="incomplete">Incomplete</option><option value="unavailable">Source unavailable</option><option value="unresolved">Unresolved</option></select></FormField>
        <FormField label="Confidence (0–100)" hint="Your assessment; distinct from source authority."><input name="confidence" type="number" min="0" max="100" defaultValue="100" /></FormField>
        <FormField label="Corrects a prior observation" hint="The prior record stays in history; its successor is linked."><select name="supersedesObservationId" defaultValue=""><option value="">No correction</option>{observations.filter((item) => !supersededIds.has(item.id)).map((item) => <option key={item.id} value={item.id}>{entityName(item.entityId)} · {item.attributeKey} = {item.value.slice(0, 55)}</option>)}</select></FormField>
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? "Recording…" : "Save evidence"}</button><button className="button button-quiet" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
      </form>
      {create.error && <div className="inline-error">{create.error.message}</div>}
    </Panel>}

    <div className="list-toolbar"><div className="list-count"><strong>{records.data?.records.length ?? 0}</strong><span>evidence records · freshness threshold {summary.data?.policies.staleAfterDays ?? 30} days</span></div><StatusChip tone="info"><Clock3 size={13} /> Times preserve when known</StatusChip></div>
    {records.error && <div className="inline-error page-error">Could not load evidence: {records.error.message}</div>}
    {records.data?.records.length === 0 && <Panel><EmptyState icon={FileCheck2} title="No evidence captured" detail="Enter an observation with a source label and the time you observed it. Future corrections will be linked rather than silently replacing this record." action={!workspace?.isIllustrative && <button className="button button-secondary" onClick={() => setShowForm(true)}><FilePlus2 size={15} /> Record the first observation</button>} /></Panel>}
    {records.data?.records.length ? <div className="evidence-list">{records.data.records.map((record) => {
      const assertion = observations.find((item) => item.evidenceId === record.id);
      const stale = (Date.now() - new Date(record.observedAt).getTime()) > (summary.data?.policies.staleAfterDays ?? 30) * 86400000;
      const conflict = assertion ? conflictIds.has(assertion.id) : false;
      const quality = conflict ? "conflicting" : stale && record.qualityState === "current" ? "stale" : record.qualityState;
      const tone = quality === "current" ? "good" : quality === "stale" || quality === "uncertain" || quality === "incomplete" ? "warn" : quality === "conflicting" || quality === "unresolved" || quality === "unavailable" ? "bad" : "info";
      const prior = assertion?.supersedesObservationId ? observations.find((item) => item.id === assertion.supersedesObservationId) : undefined;
      const linkedObligation = assertion?.obligationId ? obligationName(assertion.obligationId) : null;
      return <Panel className="evidence-card" id={`evidence-${record.id}`} key={record.id}>
        <div id={assertion ? `observation-${assertion.id}` : undefined} className="evidence-topline"><div className="evidence-source"><span className="source-icon"><FileCheck2 size={17} /></span><div><strong>{record.sourceName}</strong><small>{record.sourceType === "manual" ? "Manual source · user supplied" : record.sourceType === "sample" ? "Illustrative sample only" : "External source"}{record.sourceRef && ` · ${record.sourceRef}`}</small></div></div><StatusChip tone={tone}>{quality}</StatusChip></div>
        <blockquote>{record.claim}</blockquote>
        <div className="evidence-assertion"><span className="assertion-label">{assertion?.attributeKey ?? "Observation"}</span><strong>{assertion?.value ?? "No structured value linked"}</strong>{assertion && <span className="assertion-entity">{entityName(assertion.entityId)}</span>}</div>
        <div className="evidence-meta"><span><Clock3 size={13} /> Observed {formatDate(record.observedAt)}</span><span>Recorded {formatDate(record.recordedAt)}</span><span>Valid from {record.validFrom ? formatDate(record.validFrom) : "not specified"}{record.validTo ? ` to ${formatDate(record.validTo)}` : ""}</span><span>Authority · {authorityLabel(record.sourceAuthority)}</span><span>Confidence {record.confidence}%</span><span className="epistemic-label">{record.epistemicState} · not automatically confirmed</span></div>
        {linkedObligation && assertion && <div className="correction-trail">Related obligation · <Link href={`/obligations#obligation-${assertion.obligationId}`}>{linkedObligation}</Link></div>}
        {prior && <div className="correction-trail"><ArrowRightLeft size={14} /><span>Corrects observation #{prior.id}; the prior evidence remains preserved.</span></div>}
        {conflict && <div className="conflict-trail"><AlertTriangle size={14} /><span>Other active observations disagree with this value. No preferred interpretation has been selected.</span></div>}
      </Panel>;
    })}</div> : null}
    {message && <div className="success-message">{message} <Link href="/">View operational picture <ArrowRightLeft size={13} /></Link></div>}
  </>;
}
