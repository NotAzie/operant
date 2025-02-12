import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3, FileCheck2, GitBranch, Link2, Pencil, Plus, Search, UserRound, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { EmptyState, FormField, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";
import { auditOperationLabel, describeAuditEntry } from "@/lib/recordHistory";

const entityTypes = ["person", "organization", "account", "asset", "location", "product", "service", "resource", "device", "vehicle", "document", "invoice", "project", "contract", "task", "other"];

type EntityRecord = { id: number; entityType: string; displayName: string; description: string | null; sourceIdentity: string | null; identityState: "resolved" | "unresolved" };

export default function Entities() {
  const { workspace, workspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const entities = trpc.operant.records.entities.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const relationships = trpc.operant.records.entities.relationships.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const evidence = trpc.operant.records.evidence.list.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const entityHistory = trpc.operant.records.history.useQuery({ workspaceId: workspaceId ?? 0, recordType: "entity" }, { enabled });
  const relationshipHistory = trpc.operant.records.history.useQuery({ workspaceId: workspaceId ?? 0, recordType: "relationship" }, { enabled });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [showRelation, setShowRelation] = useState(false);
  const [showCandidate, setShowCandidate] = useState(false);
  const [editing, setEditing] = useState<EntityRecord | null>(null);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const create = trpc.operant.records.entities.create.useMutation({ onSuccess: async () => { setShowForm(false); setMessage("Entity recorded. Identity remains unresolved unless you explicitly mark it confirmed."); await utils.operant.records.entities.list.invalidate(); await utils.operant.intelligence.summary.invalidate(); await utils.operant.records.events.invalidate(); } });
  const update = trpc.operant.records.entities.update.useMutation({ onSuccess: async () => { setEditing(null); setMessage("Entity correction recorded with before/after history; linked evidence was preserved."); await utils.operant.records.entities.list.invalidate(); await utils.operant.intelligence.summary.invalidate(); await utils.operant.records.events.invalidate(); } });
  const addRelationship = trpc.operant.records.entities.addRelationship.useMutation({ onSuccess: async () => { setShowRelation(false); setMessage("Relationship recorded with its validity period and supporting context."); await utils.operant.records.entities.relationships.invalidate(); await utils.operant.records.events.invalidate(); } });
  const addCandidate = trpc.operant.records.entities.addIdentityCandidate.useMutation({ onSuccess: async () => { setShowCandidate(false); setMessage("Evidence-linked identity candidate recorded. The entity records remain separate until a user reviews it."); await utils.operant.records.entities.relationships.invalidate(); await utils.operant.records.events.invalidate(); } });
  const resolveCandidate = trpc.operant.records.entities.resolveIdentityCandidate.useMutation({ onSuccess: async ({ decision }) => { setMessage(decision === "confirmed" ? "Identity link confirmed by you. The entity records remain separate; no automatic merge occurred." : "Identity candidate rejected. The evidence and decision history remain recorded."); await utils.operant.records.entities.relationships.invalidate(); await utils.operant.records.events.invalidate(); } });
  const records = entities.data ?? [];
  const links = relationships.data ?? [];
  const evidenceRows = evidence.data?.records ?? [];
  const candidateHistory = useMemo(() => (relationshipHistory.data?.records ?? []).filter((entry) => entry.operation.startsWith("identity.candidate_")).slice(0, 60), [relationshipHistory.data]);
  const observations = evidence.data?.observations ?? [];
  const isReadOnly = Boolean(workspace?.isIllustrative) || workspace?.role === "viewer";
  const visible = records.filter((entity) => `${entity.displayName} ${entity.entityType} ${entity.description ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  const relationCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const link of links) { map.set(link.subjectEntityId, (map.get(link.subjectEntityId) ?? 0) + 1); map.set(link.objectEntityId, (map.get(link.objectEntityId) ?? 0) + 1); }
    return map;
  }, [links]);
  const evidenceCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const observation of observations) if (observation.entityId) map.set(observation.entityId, (map.get(observation.entityId) ?? 0) + 1);
    return map;
  }, [observations]);
  const evidenceById = useMemo(() => new Map(evidenceRows.map((item) => [item.id, item])), [evidenceRows]);
  const entityName = (id: number | null) => id ? records.find((item) => item.id === id)?.displayName ?? `Entity #${id}` : "No entity linked";

  const createEntity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || isReadOnly) return;
    const form = new FormData(event.currentTarget);
    create.mutate({ workspaceId, entityType: String(form.get("entityType")), displayName: String(form.get("displayName")), description: String(form.get("description") || ""), sourceIdentity: String(form.get("sourceIdentity") || "") || undefined, identityState: String(form.get("identityState")) as "resolved" | "unresolved" });
  };
  const correctEntity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || isReadOnly || !editing) return;
    const form = new FormData(event.currentTarget);
    update.mutate({ workspaceId, entityId: editing.id, displayName: String(form.get("displayName")), description: String(form.get("description") || ""), sourceIdentity: String(form.get("sourceIdentity") || "") || undefined, identityState: String(form.get("identityState")) as "resolved" | "unresolved" });
  };
  const createLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || isReadOnly) return;
    const form = new FormData(event.currentTarget);
    const evidenceId = String(form.get("evidenceId") || "");
    addRelationship.mutate({ workspaceId, subjectEntityId: Number(form.get("subjectEntityId")), predicate: String(form.get("predicate")), objectEntityId: Number(form.get("objectEntityId")), evidenceId: evidenceId ? Number(evidenceId) : undefined, epistemicState: String(form.get("epistemicState")) as "observed" | "inferred" | "unresolved", confidence: Number(form.get("confidence")), validFrom: form.get("validFrom") ? new Date(String(form.get("validFrom"))) : undefined, validTo: form.get("validTo") ? new Date(String(form.get("validTo"))) : undefined });
  };
  const createCandidate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || isReadOnly) return;
    const form = new FormData(event.currentTarget);
    addCandidate.mutate({ workspaceId, subjectEntityId: Number(form.get("subjectEntityId")), objectEntityId: Number(form.get("objectEntityId")), evidenceId: Number(form.get("evidenceId")), confidence: Number(form.get("confidence")), validFrom: form.get("validFrom") ? new Date(String(form.get("validFrom"))) : undefined, validTo: form.get("validTo") ? new Date(String(form.get("validTo"))) : undefined });
  };

  return <>
    <PageHeader eyebrow="WORLD MODEL" title="Entities & relationships" subtitle="Operationally relevant people, organizations, accounts, and resources—connected only when the evidence supports it." actions={!isReadOnly && <button className="button button-primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> Add entity</button>} />
    {workspace?.isIllustrative && <div className="sample-readonly-note"><UserRound size={15} /> This sample workspace is read-only. Switch to your workspace to add or change records.</div>}

    {showForm && !isReadOnly && <Panel className="form-panel"><div className="form-panel-heading"><div><div className="eyebrow">ADD A WORLD-MODEL ENTITY</div><h2>New entity</h2></div><button className="icon-button" aria-label="Close form" onClick={() => setShowForm(false)}><X size={17} /></button></div><form className="form-grid" onSubmit={createEntity}>
      <FormField label="Entity name"><input name="displayName" required maxLength={200} placeholder="e.g. Harbor Street Studio" /></FormField>
      <FormField label="Entity type"><select name="entityType" defaultValue="organization">{entityTypes.map((type) => <option key={type} value={type}>{type[0]?.toUpperCase()}{type.slice(1)}</option>)}</select></FormField>
      <FormField label="Source-specific identity" hint="Optional; keep external IDs distinguishable."><input name="sourceIdentity" maxLength={220} placeholder="Account number, email, registry ID…" /></FormField>
      <FormField label="Identity confirmation" hint="A source-specific ID or candidate link is not an automatic identity merge."><select name="identityState" defaultValue="unresolved"><option value="unresolved">Unresolved / needs human review</option><option value="resolved">Explicitly identified by the user</option></select></FormField>
      <FormField label="Description"><input name="description" maxLength={5000} placeholder="What makes this entity operationally relevant?" /></FormField>
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "Save entity"}</button><button className="button button-quiet" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
    </form>{create.error && <div className="inline-error">{create.error.message}</div>}</Panel>}

    {editing && !isReadOnly && <Panel className="form-panel" key={editing.id}><div className="form-panel-heading"><div><div className="eyebrow">CORRECT ENTITY RECORD</div><h2>{editing.displayName}</h2><p>Changes create a before/after audit entry and do not erase observations or source evidence.</p></div><button className="icon-button" aria-label="Close correction form" onClick={() => setEditing(null)}><X size={17} /></button></div><form className="form-grid" onSubmit={correctEntity}>
      <FormField label="Entity name"><input name="displayName" required maxLength={200} defaultValue={editing.displayName} /></FormField>
      <FormField label="Entity type"><input value={editing.entityType} disabled /></FormField>
      <FormField label="Source-specific identity"><input name="sourceIdentity" maxLength={220} defaultValue={editing.sourceIdentity ?? ""} /></FormField>
      <FormField label="Identity confirmation"><select name="identityState" defaultValue={editing.identityState}><option value="unresolved">Unresolved / needs human review</option><option value="resolved">Explicitly identified by the user</option></select></FormField>
      <FormField label="Description"><input name="description" maxLength={5000} defaultValue={editing.description ?? ""} /></FormField>
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save correction"}</button><button className="button button-quiet" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>{update.error && <div className="inline-error">{update.error.message}</div>}</Panel>}

    <div className="list-toolbar"><div className="list-count"><strong>{entities.data?.length ?? 0}</strong><span>entities in this workspace</span></div><label className="search-box"><Search size={15} /><input aria-label="Search entities" placeholder="Search the model" value={filter} onChange={(event) => setFilter(event.target.value)} /><kbd>⌘ K</kbd></label></div>

    {!entities.isLoading && records.length === 0 && <Panel><EmptyState icon={GitBranch} title="No entities yet" detail="Add a person, organization, account, document, asset, or other object you need to identify independently." action={!isReadOnly && <button className="button button-secondary" onClick={() => setShowForm(true)}><Plus size={15} /> Add the first entity</button>} /></Panel>}
    {entities.isLoading && <div className="skeleton-panel"><div /><div /><div /></div>}
    {entities.error && <div className="inline-error page-error">Could not load entities: {entities.error.message}</div>}

    {entityHistory.error && <div className="inline-error page-error">Could not load entity correction history: {entityHistory.error.message}</div>}
    {relationshipHistory.error && <div className="inline-error page-error">Could not load identity-decision history: {relationshipHistory.error.message}</div>}
    {visible.length > 0 && <div className="entity-list">{visible.map((entity) => {
      const entityLinks = links.filter((link) => link.subjectEntityId === entity.id || link.objectEntityId === entity.id);
      const entityObservations = observations.filter((item) => item.entityId === entity.id).slice(0, 3);
      const entityAudit = (entityHistory.data?.records ?? []).filter((item) => item.recordId === entity.id).slice(0, 6);
      return <Panel className="entity-card" key={entity.id} id={`entity-${entity.id}`}>
        <div className="entity-main"><span className={`entity-type-icon entity-${entity.entityType}`}><UserRound size={18} /></span><div className="entity-copy"><div className="entity-title-row"><h2>{entity.displayName}</h2><StatusChip tone={entity.identityState === "unresolved" ? "warn" : "good"}>{entity.identityState === "unresolved" ? "Unresolved identity" : "User identified"}</StatusChip>{!isReadOnly && <button className="button button-quiet button-small" onClick={() => { setShowForm(false); setEditing(entity); }}><Pencil size={13} /> Correct record</button>}</div><p>{entity.description || "No description recorded."}</p><div className="entity-meta"><span>{entity.entityType}</span>{entity.sourceIdentity && <span>Source ID · {entity.sourceIdentity}</span>}<span>{evidenceCounts.get(entity.id) ?? 0} observations</span><span>{relationCounts.get(entity.id) ?? 0} relationships</span></div></div><span className="entity-id">#{String(entity.id).padStart(4, "0")}</span></div>
        {entityObservations.length > 0 && <div className="entity-observations"><strong>Linked observations</strong>{entityObservations.map((observation) => { const source = evidenceById.get(observation.evidenceId); return <Link key={observation.id} href={`/evidence#observation-${observation.id}`}><span>{observation.attributeKey} · {observation.value.slice(0, 70)}</span><small>{source?.sourceName ?? "Source unavailable"} · {new Date(observation.observedAt).toLocaleDateString()}</small></Link>; })}</div>}
        {entityAudit.length > 0 && <details className="history-details"><summary><Clock3 size={14} /> {entityAudit.length} entity history {entityAudit.length === 1 ? "entry" : "entries"}</summary><div className="history-list">{entityAudit.map((entry) => <div className="history-row" key={entry.id}><span><strong>{auditOperationLabel(entry.operation)}</strong> by {entry.actorId ? `member #${entry.actorId}` : "unknown member"}</span><small>{new Date(entry.createdAt).toLocaleString()}</small><p>{describeAuditEntry(entry.operation, entry.details)}</p></div>)}</div></details>}
        {entityLinks.length > 0 && <div className="entity-relations"><Link2 size={14} />{entityLinks.slice(0, 4).map((link) => { const otherId = link.subjectEntityId === entity.id ? link.objectEntityId : link.subjectEntityId; const other = records.find((record) => record.id === otherId); const isCandidate = link.predicate === "possible_identity_match"; const state = isCandidate && link.epistemicState === "observed" ? "confirmed · records separate" : isCandidate && link.epistemicState === "rejected" ? "rejected" : link.epistemicState; return <span className="relation-pill" key={link.id}>{link.subjectEntityId === entity.id ? link.predicate : `is ${link.predicate} by`} <b>{other?.displayName ?? `Entity #${otherId}`}</b><i>{state}</i></span>; })}</div>}
      </Panel>;
    })}</div>}

    {records.length > 0 && <Panel className="relation-panel"><div className="panel-heading"><div><div className="eyebrow">TIME-BOUNDED LINKS</div><h2>Relationships</h2></div><div className="page-actions">{!isReadOnly && <><button className="button button-secondary button-small" onClick={() => { setShowRelation((value) => !value); setShowCandidate(false); }}><Plus size={14} /> Add relationship</button><button className="button button-secondary button-small" onClick={() => { setShowCandidate((value) => !value); setShowRelation(false); }}><GitBranch size={14} /> Identity candidate</button></>}</div></div>
      {showRelation && !isReadOnly && records.length > 1 && <form className="form-grid relation-form" onSubmit={createLink}>
        <FormField label="Subject"><select name="subjectEntityId" required>{records.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></FormField><FormField label="Relationship"><input name="predicate" required maxLength={100} placeholder="owns, manages, assigned to…" /></FormField><FormField label="Object"><select name="objectEntityId" required>{records.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></FormField><FormField label="Evidence state"><select name="epistemicState"><option value="observed">Observed</option><option value="inferred">Inferred</option><option value="unresolved">Unresolved</option></select></FormField><FormField label="Supporting evidence"><select name="evidenceId" defaultValue=""><option value="">Not linked</option>{evidenceRows.map((item) => <option key={item.id} value={item.id}>{item.sourceName} · {item.claim.slice(0, 55)}</option>)}</select></FormField><FormField label="Confidence (0–100)"><input name="confidence" type="number" min="0" max="100" defaultValue="100" /></FormField><FormField label="Valid from"><input name="validFrom" type="date" /></FormField><FormField label="Valid until"><input name="validTo" type="date" /></FormField><div className="form-actions"><button className="button button-primary" type="submit" disabled={addRelationship.isPending}>{addRelationship.isPending ? "Saving…" : "Save relationship"}</button></div>
      </form>}
      {showCandidate && !isReadOnly && records.length > 1 && <div className="identity-candidate-form"><div><strong>Record a possible identity match</strong><p>Link separate entities with supporting evidence and confidence. Confirmation creates a human-reviewed relationship only; it never merges or deletes records.</p></div>{evidenceRows.length ? <form className="form-grid relation-form" onSubmit={createCandidate}>
        <FormField label="First entity"><select name="subjectEntityId" required>{records.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></FormField><FormField label="Possible same entity"><select name="objectEntityId" required>{records.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></FormField><FormField label="Supporting evidence (required)"><select name="evidenceId" required defaultValue=""><option value="" disabled>Select evidence…</option>{evidenceRows.map((item) => <option key={item.id} value={item.id}>{item.sourceName} · {item.claim.slice(0, 55)}</option>)}</select></FormField><FormField label="Confidence (0–100)"><input name="confidence" type="number" min="0" max="100" defaultValue="50" /></FormField><FormField label="Valid from"><input name="validFrom" type="date" /></FormField><FormField label="Valid until"><input name="validTo" type="date" /></FormField><div className="form-actions"><button className="button button-primary" type="submit" disabled={addCandidate.isPending}>{addCandidate.isPending ? "Saving…" : "Save unresolved candidate"}</button></div>
      </form> : <p className="candidate-no-evidence">Capture supporting evidence before recording an identity candidate. <Link href="/evidence">Record evidence <ArrowRight size={13} /></Link></p>}{addCandidate.error && <div className="inline-error">{addCandidate.error.message}</div>}</div>}
      {links.length ? <div className="relationship-list">{links.map((link) => { const from = records.find((item) => item.id === link.subjectEntityId); const to = records.find((item) => item.id === link.objectEntityId); const linkedEvidence = link.evidenceId ? evidenceById.get(link.evidenceId) : undefined; const isCandidate = link.predicate === "possible_identity_match"; const confirmed = isCandidate && link.epistemicState === "observed"; const rejected = isCandidate && link.epistemicState === "rejected"; const tone = link.epistemicState === "unresolved" ? "warn" : link.epistemicState === "inferred" ? "info" : rejected ? "bad" : "good"; return <div className="relationship-row" key={link.id}><span className="relation-node">{from?.displayName ?? `#${link.subjectEntityId}`}</span><span className="relation-arrow"><span />{link.predicate}<ArrowRight size={14} /></span><span className="relation-node">{to?.displayName ?? `#${link.objectEntityId}`}</span><StatusChip tone={tone}>{isCandidate ? confirmed ? "confirmed match · not merged" : rejected ? "candidate rejected" : "unresolved candidate" : link.epistemicState}</StatusChip><small>{new Date(link.validFrom).toLocaleDateString()}{link.validTo ? ` – ${new Date(link.validTo).toLocaleDateString()}` : " – current"}</small>{linkedEvidence && <Link className="identity-evidence-link" href={`/evidence#evidence-${linkedEvidence.id}`}><FileCheck2 size={13} />{linkedEvidence.sourceName}</Link>}{isCandidate && link.epistemicState === "unresolved" && !isReadOnly && <div className="candidate-actions"><button className="button button-secondary button-small" disabled={resolveCandidate.isPending} onClick={() => resolveCandidate.mutate({ workspaceId: workspaceId!, relationshipId: link.id, decision: "confirmed" })}><Check size={13} /> Confirm link (no merge)</button><button className="text-button text-danger" disabled={resolveCandidate.isPending} onClick={() => resolveCandidate.mutate({ workspaceId: workspaceId!, relationshipId: link.id, decision: "rejected" })}>Reject candidate</button></div>}</div>; })}</div> : <EmptyState icon={Link2} title="No relationships recorded" detail="Create time-bounded links only when they are operationally relevant. Candidate identity matches must have evidence and remain unresolved until a user confirms or rejects them." />}
      {candidateHistory.length > 0 && <details className="history-details"><summary><Clock3 size={14} /> Identity-candidate decisions ({candidateHistory.length})</summary><div className="history-list">{candidateHistory.map((entry) => { const relation = links.find((link) => link.id === entry.recordId); const from = relation ? records.find((item) => item.id === relation.subjectEntityId) : undefined; const to = relation ? records.find((item) => item.id === relation.objectEntityId) : undefined; return <div className="history-row" key={entry.id}><span><strong>{from?.displayName ?? "Entity"} ↔ {to?.displayName ?? "Entity"}</strong> · {auditOperationLabel(entry.operation)} by {entry.actorId ? `member #${entry.actorId}` : "unknown member"}</span><small>{new Date(entry.createdAt).toLocaleString()}</small><p>{describeAuditEntry(entry.operation, entry.details)}</p></div>; })}</div></details>}
      {addRelationship.error && <div className="inline-error">{addRelationship.error.message}</div>}{resolveCandidate.error && <div className="inline-error">{resolveCandidate.error.message}</div>}
    </Panel>}
    {message && <div className="success-message">{message}</div>}
  </>;
}
