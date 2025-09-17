import { useMemo } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  BellRing,
  BookOpenCheck,
  Clock3,
  FileCheck2,
  FilePlus2,
  GitBranch,
  Link2,
  Plus,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { EmptyState, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "No date recorded";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function destination(kind: string, recordId: number) {
  if (kind === "obligation") return `/obligations#obligation-${recordId}`;
  if (kind === "evidence") return `/evidence#evidence-${recordId}`;
  if (kind === "conflict") return `/evidence#observation-${recordId}`;
  if (kind === "action") return `/actions#action-${recordId}`;
  return "/entities";
}

function AttentionMark({ kind, severity }: { kind: string; severity: string }) {
  if (kind === "action") return <BellRing size={16} />;
  if (kind === "conflict") return <GitBranch size={16} />;
  if (severity === "high") return <AlertTriangle size={16} />;
  if (kind === "obligation") return <ReceiptText size={16} />;
  return <Clock3 size={16} />;
}

export default function Home() {
  const { workspace, workspaceId, setWorkspaceId } = useWorkspace();
  const summary = trpc.operant.intelligence.summary.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled: !!workspaceId, refetchOnWindowFocus: true });
  const utils = trpc.useUtils();
  const sample = trpc.operant.workspace.createIllustrative.useMutation({
    onSuccess: async ({ workspaceId: id }) => {
      await utils.operant.workspace.list.invalidate();
      setWorkspaceId(id);
    },
  });
  const data = summary.data;
  const noRecords = data && data.counts.entities + data.counts.openObligations + data.counts.evidence + data.counts.unreviewedActions === 0;
  const dayPart = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }, []);

  return (
    <>
      <PageHeader
        eyebrow={dayPart.toUpperCase()}
        title="Your operational picture"
        subtitle="What changed, what needs attention, and what the current evidence supports."
        actions={<><Link className="button button-secondary" href="/evidence"><FilePlus2 size={15} /> Record evidence</Link><Link className="button button-primary" href="/obligations"><Plus size={16} /> Add obligation</Link></>}
      />

      {summary.isError && <div className="inline-error page-error">Operational data could not be loaded: {summary.error.message}</div>}
      {summary.isLoading && <div className="skeleton-panel"><div /><div /><div /></div>}

      {data && (
        <>
          <div className="overview-grid">
            <Panel className="attention-panel">
              <div className="panel-heading">
                <div><div className="eyebrow">ATTENTION QUEUE</div><h2>{data.attention.length ? `${data.attention.length} items to review` : "Nothing needs review"}</h2></div>
                <span className={`attention-count ${data.attention.some((item) => item.severity === "high") ? "attention-count-warn" : ""}`}>{String(data.attention.length).padStart(2, "0")}</span>
              </div>
              {data.attention.length ? (
                <div className="attention-list">
                  {data.attention.slice(0, 5).map((item) => <Link href={destination(item.kind, item.recordId)} className={`attention-row attention-${item.severity}`} key={item.id}>
                    <span className="attention-icon"><AttentionMark kind={item.kind} severity={item.severity} /></span>
                    <span className="attention-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <ArrowUpRight size={15} className="attention-arrow" />
                  </Link>)}
                </div>
              ) : (
                <div className="quiet-success"><span><BadgeCheck size={18} /></span><div><strong>No deterministic attention rules are currently firing.</strong><small>This is not a statement that every part of your operations is known.</small></div></div>
              )}
              <div className="panel-footer-note"><ShieldCheck size={14} /> Every signal is based on a visible rule and linked record.</div>
            </Panel>

            <Panel className="pulse-panel">
              <div className="panel-heading"><div><div className="eyebrow">WORKSPACE SIGNAL</div><h2>Evidence at a glance</h2></div><span className="signal-mark"><Activity size={17} /></span></div>
              <div className="signal-row"><span className="signal-label"><GitBranch size={15} /> Operational entities</span><strong>{data.counts.entities.toString().padStart(2, "0")}</strong></div>
              <div className="signal-row"><span className="signal-label"><ReceiptText size={15} /> Open obligations</span><strong>{data.counts.openObligations.toString().padStart(2, "0")}</strong></div>
              <div className="signal-row"><span className="signal-label"><FileCheck2 size={15} /> Evidence records</span><strong>{data.counts.evidence.toString().padStart(2, "0")}</strong></div>
              <div className="signal-row"><span className="signal-label"><AlertCircle size={15} /> Unresolved conflicts</span><strong className={data.counts.unresolvedConflicts ? "text-amber" : ""}>{data.counts.unresolvedConflicts.toString().padStart(2, "0")}</strong></div>
              <div className="signal-bottom"><span className="signal-live-dot" />Rules evaluated against scoped records<span>{dateLabel(data.generatedAt)}</span></div>
            </Panel>
          </div>

          <div className="content-grid overview-lower">
            <Panel>
              <div className="panel-heading"><div><div className="eyebrow">CHANGE HISTORY</div><h2>Recent activity</h2></div><Link className="text-link" href="/evidence">All records <ArrowRight size={14} /></Link></div>
              {data.recentEvents.length ? <div className="activity-list">{data.recentEvents.slice(0, 6).map((event) => <div className="activity-row" key={event.id}>
                <span className="activity-dot"><Activity size={13} /></span><div className="activity-copy"><strong>{event.summary}</strong><small>{event.eventType.replace(/[._]/g, " ")} · {dateLabel(event.recordedAt)}{event.epistemicState !== "observed" && ` · ${event.epistemicState}`}</small></div>
              </div>)}</div> : <EmptyState icon={BookOpenCheck} title="Your history begins with evidence" detail="Capture an observation or add a commitment. Operant will keep its source and when it was recorded." action={<Link className="text-link" href="/evidence">Record the first observation <ArrowRight size={14} /></Link>} />}
            </Panel>
            <Panel className="protocol-panel">
              <div className="eyebrow">THE OPERATING PRINCIPLE</div>
              <h2>Attempted is not<br /><em>confirmed.</em></h2>
              <p>Every proposed action has a separate approval step. Internal follow-ups are only confirmed after the record is actually saved.</p>
              <div className="protocol-flow"><span>Evidence</span><i /><span>Review</span><i /><span>Authorized</span><i /><span>Verified</span></div>
              <Link className="text-link" href="/actions">Review action controls <ArrowRight size={14} /></Link>
            </Panel>
          </div>

          {noRecords && !workspace?.isIllustrative && <Panel className="start-panel">
            <div className="start-mark"><Link2 size={22} /></div>
            <div className="start-copy"><div className="eyebrow">A CLEAN START</div><h2>No operational records yet</h2><p>This workspace begins empty. Add real information manually, or open a separate read-only sample workspace to explore the interface.</p></div>
            <div className="start-actions"><Link className="button button-secondary" href="/entities"><Plus size={15} /> Add an entity</Link><button className="button button-quiet" onClick={() => sample.mutate()} disabled={sample.isPending}><BookOpenCheck size={15} /> {sample.isPending ? "Preparing example…" : "Explore sample workspace"}</button>{sample.error && <small className="inline-error">{sample.error.message}</small>}</div>
          </Panel>}

          <div className="bottom-note"><span><ArrowDownRight size={15} /></span><span>Information can be incomplete or stale. Inspect evidence before acting.</span><span className="bottom-note-date">Updated {dateLabel(data.generatedAt)}</span></div>
        </>
      )}
    </>
  );
}
