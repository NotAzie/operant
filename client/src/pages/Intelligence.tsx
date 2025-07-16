import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, CircleHelp, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { EmptyState, FormField, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";

type CandidatePlanView = {
  mode?: string;
  generatedAt?: string;
  policies?: { dueSoonDays?: number; staleAfterDays?: number };
  objectives?: Array<{ id: number; title: string; priority: string }>;
  candidates?: Array<{ id: string; kind: string; title: string; priority: string; reason: string; evidenceIds: number[]; objectiveIds: number[]; targetId: number }>;
  resourceConstraints?: Array<{ resourceId: number; name: string; availabilityState: string; capacity: string | null; unit: string | null; activeAllocated: string | null; overAllocated: boolean; evidenceId: number | null }>;
  activeResponsibilityCount?: number;
  rules?: string[];
};
type GroundedOutputView = {
  summary?: string;
  conclusions?: Array<{ text: string; epistemicState: string; confidence: number; evidenceIds: number[]; uncertainty: string | null }>;
  recommendations?: Array<{ text: string; evidenceIds: number[]; objectiveIds: number[]; constraints: string[] }>;
  uncertainties?: string[];
};

const time = (value?: Date | string | null) => value ? new Date(value).toLocaleString() : "—";
const tone = (status: string) => status === "completed" ? "good" as const : status === "running" || status === "queued" ? "warn" as const : status === "failed" || status === "unavailable" ? "bad" as const : "neutral" as const;

function CandidatePlan({ plan }: { plan: CandidatePlanView | null }) {
  if (!plan) return <div className="empty-small">No candidate-plan snapshot is attached to this older run.</div>;
  return <div className="plan-snapshot">
    <div className="plan-snapshot-heading"><strong>Deterministic review candidates</strong><small>Captured {time(plan.generatedAt)} · advisory only · due policy {plan.policies?.dueSoonDays ?? "—"}d · freshness policy {plan.policies?.staleAfterDays ?? "—"}d</small></div>
    <div className="plan-overview"><span>{plan.candidates?.length ?? 0} candidate{plan.candidates?.length === 1 ? "" : "s"}</span><span>{plan.objectives?.length ?? 0} explicit objective{plan.objectives?.length === 1 ? "" : "s"}</span><span>{plan.activeResponsibilityCount ?? 0} current assignment{plan.activeResponsibilityCount === 1 ? "" : "s"}</span></div>
    {plan.candidates?.length ? <div className="plan-candidates">{plan.candidates.map((candidate) => <div className="plan-candidate" key={candidate.id}><div className="event-title"><strong>{candidate.title}</strong><StatusChip tone={candidate.priority === "high" ? "bad" : candidate.priority === "medium" ? "warn" : "info"}>{candidate.priority}</StatusChip></div><p>{candidate.reason}</p><small>{candidate.kind.replaceAll("_", " ")} · record #{candidate.targetId} · {candidate.evidenceIds.length ? `Evidence ${candidate.evidenceIds.map((id) => `#${id}`).join(", ")}` : "No evidence linked"}</small></div>)}</div> : <div className="empty-small">No deterministic review candidates were triggered by the captured rules.</div>}
    {plan.resourceConstraints?.length ? <div className="resource-constraint-list"><strong>Resource snapshot</strong>{plan.resourceConstraints.map((resource) => <div key={resource.resourceId}><span>{resource.name}</span><StatusChip tone={resource.availabilityState === "available" ? "good" : resource.availabilityState === "unknown" ? "neutral" : "warn"}>{resource.availabilityState}</StatusChip><small>Active allocation {resource.activeAllocated ?? "not comparable"}{resource.unit ? ` ${resource.unit}` : ""}{resource.capacity ? ` / ${resource.capacity} ${resource.unit ?? ""}` : " / capacity not recorded"}{resource.overAllocated ? " · over capacity" : ""}</small></div>)}</div> : <div className="empty-small">No current temporal resource version was available in this run snapshot.</div>}
    {plan.rules?.length ? <details className="history-details"><summary>Deterministic plan rules</summary><ul className="plan-rules">{plan.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul></details> : null}
  </div>;
}

function GroundedOutput({ value }: { value: GroundedOutputView | null }) {
  if (!value) return <div className="empty-small">This run did not produce a grounded conclusion. Check its recorded status and error.</div>;
  return <div className="grounded-output">
    {value.summary && <p className="grounded-summary">{value.summary}</p>}
    {(value.conclusions?.length ?? 0) > 0 && <div className="grounded-section"><strong>Conclusions</strong>{value.conclusions!.map((item, index) => <div className="grounded-item" key={`${index}-${item.text}`}><p>{item.text}</p><small><StatusChip tone="info">{item.epistemicState}</StatusChip> Confidence {item.confidence}% · evidence {item.evidenceIds.map((id) => `#${id}`).join(", ")}</small>{item.uncertainty && <small className="uncertainty-text">Uncertainty: {item.uncertainty}</small>}</div>)}</div>}
    {(value.recommendations?.length ?? 0) > 0 && <div className="grounded-section"><strong>Recommendations · advisory, not actions</strong>{value.recommendations!.map((item, index) => <div className="grounded-item grounded-recommendation" key={`${index}-${item.text}`}><p>{item.text}</p><small>Evidence {item.evidenceIds.map((id) => `#${id}`).join(", ")} · objectives {item.objectiveIds.length ? item.objectiveIds.map((id) => `#${id}`).join(", ") : "none explicitly linked"}</small>{item.constraints.length > 0 && <small>Constraints: {item.constraints.join(" · ")}</small>}</div>)}</div>}
    {(value.uncertainties?.length ?? 0) > 0 && <div className="uncertainty-list"><strong><AlertTriangle size={14} /> Unresolved uncertainty</strong><ul>{value.uncertainties!.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
  </div>;
}

export default function Intelligence() {
  const { workspace, workspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const [modelId, setModelId] = useState("");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const models = trpc.operant.reasoning.models.useQuery(undefined, { enabled });
  const runs = trpc.operant.reasoning.runs.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled, refetchOnWindowFocus: true });
  const jobs = trpc.operant.reasoning.jobs.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled, refetchOnWindowFocus: true });
  const settings = trpc.operant.intelligence.settings.get.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const utils = trpc.useUtils();
  const readOnly = Boolean(workspace?.isIllustrative) || workspace?.role === "viewer";
  const availableModels = models.data?.models ?? [];
  useEffect(() => { if (!modelId && availableModels[0]) setModelId(availableModels[0].id); }, [availableModels, modelId]);
  const run = trpc.operant.reasoning.run.useMutation({ onSuccess: async (result) => { setMessage(`Run #${result.id} completed. The candidate plan and context hash were persisted.`); setJobId(""); await Promise.all([utils.operant.reasoning.runs.invalidate(), utils.operant.reasoning.jobs.invalidate()]); } });
  const queuedJobs = jobs.data?.jobs.filter((job) => job.status === "queued") ?? [];
  const activeObjectives = settings.data?.objectives.filter((objective) => objective.active) ?? [];
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!workspaceId || !modelId || readOnly) return; run.mutate({ workspaceId, modelId, analysisJobId: jobId ? Number(jobId) : undefined }); };

  return <>
    <PageHeader eyebrow="GROUNDED ANALYSIS" title="Intelligence" subtitle="Evidence-cited interpretations and review candidates, with context hashes, objectives, policy and uncertainty retained per run." actions={<button className="button button-secondary button-small" onClick={() => { void models.refetch(); void runs.refetch(); void jobs.refetch(); }}><RefreshCw size={14} /> Refresh</button>} />
    {workspace?.isIllustrative && <div className="sample-readonly-note"><ShieldCheck size={15} /> Sample workspace is read-only; no reasoning run can be recorded.</div>}
    {message && <div className="success-message"><ShieldCheck size={15} /> {message}</div>}
    <div className="intelligence-layout">
      <Panel className="reasoning-launch-panel"><div className="panel-heading"><div><div className="eyebrow">EXPLICIT RUN</div><h2>Review the captured workspace</h2></div><span className="settings-mark"><BrainCircuit size={17} /></span></div>
        <p className="panel-intro">Each run retrieves scoped evidence, current assertions, obligations, explicit objectives, policies, resource versions, allocations and assignments. It stores a deterministic candidate plan before the model call. No action is executed.</p>
        <form className="objective-form" onSubmit={submit}>
          <FormField label="Live GPT-5 model"><select value={modelId} onChange={(event) => setModelId(event.target.value)} required disabled={models.isLoading || !availableModels.length}><option value="">{models.isLoading ? "Loading runtime catalog…" : "No eligible model"}</option>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}</select><small>{models.data?.notice ?? "Model choices are filtered from the current server-side catalog."}</small></FormField>
          <FormField label="Queued event-analysis job (optional)"><select value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">Manual workspace review</option>{queuedJobs.map((job) => <option key={job.id} value={job.id}>Job #{job.id} · event #{job.eventId} · {job.provider} {job.eventType}/{job.eventAction}</option>)}</select><small>Only the selected queued job will be marked completed if this run succeeds.</small></FormField>
          <button className="button button-primary" type="submit" disabled={readOnly || run.isPending || !modelId}><BrainCircuit size={15} /> {run.isPending ? "Recording and reasoning…" : jobId ? "Run event analysis" : "Run grounded analysis"}</button>
        </form>
        {(models.error || jobs.error || run.error) && <div className="inline-error">{models.error?.message || jobs.error?.message || run.error?.message}</div>}
        <div className="plan-input-note"><strong>Policy snapshot</strong><span>Due soon: {settings.data?.policies.find((item) => item.key === "due_soon_days")?.value ?? 7} UTC calendar day(s)</span><span>Evidence freshness: {settings.data?.policies.find((item) => item.key === "stale_after_days")?.value ?? 30} day(s)</span><span>Explicit objectives: {activeObjectives.length}</span></div>
        {models.data && <small className="catalog-stamp">Catalog checked {new Date(models.data.checkedAt).toLocaleString()} · pricing not exposed by runtime.</small>}
        <div className="bottom-note"><span><ShieldCheck size={15} /></span><span>Manual only · maximum three model runs per member per hour · project-credit usage follows the configured runtime.</span></div>
      </Panel>
      <Panel className="queued-jobs-panel"><div className="panel-heading"><div><div className="eyebrow">EVENT ANALYSIS</div><h2>Durable jobs</h2></div><StatusChip tone={queuedJobs.length ? "warn" : "good"}>{queuedJobs.length} queued</StatusChip></div>
        {jobs.isLoading ? <div className="empty-small">Loading analysis jobs…</div> : jobs.error ? <div className="inline-error">{jobs.error.message}</div> : jobs.data?.jobs.length ? <div className="job-list">{jobs.data.jobs.map((job) => <div className="job-row" key={job.id}><div><strong>Analysis job #{job.id}</strong><small>Inbox event #{job.eventId} · {job.provider} · {job.eventType}{job.eventAction ? ` / ${job.eventAction}` : ""}</small></div><StatusChip tone={tone(job.status)}>{job.status}</StatusChip><small>{time(job.createdAt)}</small></div>)}</div> : <EmptyState icon={CircleHelp} title="No event-analysis jobs" detail="Eligible inbound events create a queued analysis job. Select one above for a deliberate, attributable run." />}
      </Panel>
    </div>
    <Panel className="reasoning-runs-panel"><div className="panel-heading"><div><div className="eyebrow">PROVENANCE · LATEST 50</div><h2>Reasoning runs and candidate plans</h2></div><span className="settings-mark"><Clock3 size={17} /></span></div>
      {runs.isLoading ? <div className="empty-small">Loading reasoning history…</div> : runs.error ? <div className="inline-error">{runs.error.message}</div> : (runs.data?.length ?? 0) === 0 ? <EmptyState icon={BrainCircuit} title="No reasoning runs yet" detail="The system does not infer priorities before an operator asks for an analysis." /> : <div className="reasoning-run-list">{runs.data!.map((item) => {
        const plan = item.candidatePlan && typeof item.candidatePlan === "object" ? item.candidatePlan as CandidatePlanView : null;
        const output = item.output && typeof item.output === "object" ? item.output as GroundedOutputView : null;
        return <article className="reasoning-run" key={item.id}><div className="run-heading"><div><div className="event-title"><strong>Run #{item.id}</strong><StatusChip tone={tone(item.status)}>{item.status}</StatusChip><StatusChip tone="info">{item.trigger}</StatusChip></div><small>{item.modelId} · started {time(item.startedAt)}{item.completedAt ? ` · finished ${time(item.completedAt)}` : ""}</small></div><code title={item.contextHash}>Context SHA-256 {item.contextHash.slice(0, 16)}…</code></div>
          {item.errorMessage && <div className="inline-error">{item.errorClass ? `${item.errorClass}: ` : ""}{item.errorMessage} No conclusion is claimed.</div>}
          <details className="run-details" open={item.id === runs.data?.[0]?.id}><summary>Review persisted plan and result</summary><CandidatePlan plan={plan} /><GroundedOutput value={output} />
            <div className="run-provenance"><span>Prompt {item.promptTokens ?? "—"} tokens</span><span>Completion {item.completionTokens ?? "—"} tokens</span><span>Explicit objectives captured: {item.objectiveSnapshot.length}</span><span>Policy keys captured: {Object.keys(item.policySnapshot).join(", ") || "none"}</span><Link href="/evidence">Evidence register <ArrowRight size={13} /></Link></div>
          </details>
        </article>;
      })}</div>}
    </Panel>
  </>;
}
