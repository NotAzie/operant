import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleHelp, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FormField, PageHeader, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";
import GitHubConnectionsPanel from "@/components/GitHubConnectionsPanel";

type ReadinessPayload = {
  status?: string;
  database?: string;
  eventQueueSchema?: string;
  activeRetryScheduleRegistered?: boolean;
  correlationId?: string;
};

function SystemReadinessPanel() {
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [failedToReachReadiness, setFailedToReachReadiness] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setFailedToReachReadiness(false);
    try {
      const [healthResponse, readinessResponse] = await Promise.all([
        fetch("/api/health", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/ready", { credentials: "same-origin", cache: "no-store" }).catch(() => null),
      ]);
      const healthBody = await healthResponse.json().catch(() => null) as { status?: string } | null;
      const readinessBody = readinessResponse ? await readinessResponse.json().catch(() => null) as ReadinessPayload | null : null;
      setApiAvailable(Boolean(healthResponse.ok && healthBody?.status === "ok"));
      setReadiness(readinessBody);
      setFailedToReachReadiness(!readinessResponse);
      setCheckedAt(new Date());
    } catch {
      setApiAvailable(false);
      setReadiness(null);
      setFailedToReachReadiness(true);
      setCheckedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const ready = readiness?.status === "ready";
  const workerRegistered = readiness?.activeRetryScheduleRegistered;
  return <Panel className="system-readiness-panel"><div className="panel-heading"><div><div className="eyebrow">RUNTIME & READINESS</div><h2>System health</h2></div><button className="button button-secondary button-small" disabled={loading} onClick={() => void refresh()}><RefreshCw size={13} /> Refresh</button></div>
    <div className="system-health-grid"><div><small>API liveness</small>{loading ? <StatusChip tone="neutral">Checking</StatusChip> : <StatusChip tone={apiAvailable ? "good" : "bad"}>{apiAvailable ? "Available" : "Unavailable"}</StatusChip>}</div><div><small>Database & inbox schema</small>{loading ? <StatusChip tone="neutral">Checking</StatusChip> : <StatusChip tone={ready ? "good" : readiness ? "bad" : "neutral"}>{ready ? "Ready" : readiness?.status === "not_ready" ? "Not ready" : "Unknown"}</StatusChip>}</div><div><small>Retry worker registration</small>{loading ? <StatusChip tone="neutral">Checking</StatusChip> : <StatusChip tone={workerRegistered ? "good" : ready ? "warn" : "neutral"}>{workerRegistered ? "Registered" : ready ? "Not registered" : "Unknown"}</StatusChip>}</div></div>
    <div className="system-health-footnote"><span>Only minimal runtime state is returned; workspace records and credentials are not exposed.</span>{checkedAt && <small>Checked {checkedAt.toLocaleString()}</small>}</div>
    {failedToReachReadiness && <div className="inline-error">Readiness could not be reached. Refresh to retry.</div>}
    {readiness?.status === "not_ready" && readiness.correlationId && <div className="permission-note">Readiness failed for this request. Correlation ID: <code>{readiness.correlationId}</code></div>}
  </Panel>;
}

export default function Settings() {
  const { workspace, workspaceId, workspaces, setWorkspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const settings = trpc.operant.intelligence.settings.get.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const members = trpc.operant.workspace.members.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled });
  const utils = trpc.useUtils();
  const [message, setMessage] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [objectiveTitle, setObjectiveTitle] = useState("");
  const [objectiveDescription, setObjectiveDescription] = useState("");
  const [objectivePriority, setObjectivePriority] = useState<"required" | "preference">("preference");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [policyValues, setPolicyValues] = useState<Record<string, number>>({});
  const canManage = workspace?.role === "owner" || workspace?.role === "admin";
  const readOnly = Boolean(workspace?.isIllustrative);
  const refresh = async () => { await Promise.all([utils.operant.intelligence.settings.get.invalidate(), utils.operant.workspace.members.invalidate(), utils.operant.workspace.list.invalidate()]); };
  const createOrg = trpc.operant.workspace.createOrganization.useMutation({ onSuccess: async ({ workspaceId: id }) => { setMessage("Organization workspace created."); setNewWorkspaceName(""); await refresh(); setWorkspaceId(id); } });
  const createSample = trpc.operant.workspace.createIllustrative.useMutation({ onSuccess: async ({ workspaceId: id }) => { setMessage("The separate, read-only illustrative workspace is ready."); await refresh(); setWorkspaceId(id); } });
  const removeSample = trpc.operant.workspace.removeIllustrative.useMutation({ onSuccess: async () => { setMessage("Illustrative workspace and its example records were removed."); await refresh(); } });
  const addMember = trpc.operant.workspace.addMemberByEmail.useMutation({ onSuccess: async (result) => { setMessage(result.added ? result.alreadyMember ? "That account is already a workspace member." : "Member added. They must sign in with their own Manus account." : "No registered Manus account matched that email. No invitation email was sent."); setNewMemberEmail(""); await refresh(); } });
  const setRole = trpc.operant.workspace.setMemberRole.useMutation({ onSuccess: async () => { setMessage("Member role updated."); await refresh(); } });
  const updatePolicy = trpc.operant.intelligence.settings.setPolicy.useMutation({ onSuccess: async () => { setMessage("Rule threshold saved."); await refresh(); await utils.operant.intelligence.summary.invalidate(); } });
  const addObjective = trpc.operant.intelligence.settings.addObjective.useMutation({ onSuccess: async () => { setMessage("Objective recorded."); setObjectiveTitle(""); setObjectiveDescription(""); setObjectivePriority("preference"); await refresh(); } });
  const removeObjective = trpc.operant.intelligence.settings.removeObjective.useMutation({ onSuccess: async () => { setMessage("Objective archived; its history is retained."); await refresh(); } });

  const createOrganization = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (newWorkspaceName.trim()) createOrg.mutate({ name: newWorkspaceName.trim() }); };
  const invite = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (workspaceId && newMemberEmail) addMember.mutate({ workspaceId, email: newMemberEmail.trim(), role: newMemberRole }); };
  const submitObjective = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (workspaceId && objectiveTitle.trim()) addObjective.mutate({ workspaceId, title: objectiveTitle.trim(), description: objectiveDescription.trim() || undefined, priority: objectivePriority }); };
  const savePolicy = (key: "due_soon_days" | "stale_after_days", current: number) => {
    if (!workspaceId) return;
    const value = policyValues[key] ?? current;
    updatePolicy.mutate({ workspaceId, key, value });
  };
  const error = createOrg.error?.message || createSample.error?.message || addMember.error?.message || setRole.error?.message || updatePolicy.error?.message || addObjective.error?.message || removeObjective.error?.message || removeSample.error?.message;
  const policy = settings.data?.policies ?? [];
  const dueSoon = policy.find((item) => item.key === "due_soon_days")?.value ?? 7;
  const staleAfter = policy.find((item) => item.key === "stale_after_days")?.value ?? 30;

  return <>
    <PageHeader eyebrow="SCOPE, RULES & TRUST" title="Workspace settings" subtitle="Configure workspace authority, policies, explicit objectives and verified provider connections." />
    {message && <div className="success-message"><Check size={15} /> {message}</div>}
    {error && <div className="inline-error page-error">{error}</div>}
    {readOnly && <div className="sample-readonly-note"><CircleHelp size={15} /> Illustrative workspaces cannot be modified. Switch to a real workspace to manage its settings.</div>}

    <SystemReadinessPanel />

    <div className="settings-grid">
      <div className="settings-column">
        <Panel className="settings-panel"><div className="panel-heading"><div><div className="eyebrow">CURRENT SCOPE</div><h2>Workspace identity</h2></div><span className="settings-mark"><Users size={17} /></span></div>
          <div className="workspace-identity"><span className="workspace-symbol"><Users size={18} /></span><div><strong>{workspace?.name}</strong><small>{workspace?.kind === "personal" ? "Personal workspace" : "Organization workspace"} · Your role: {workspace?.role}</small></div><StatusChip tone={workspace?.isIllustrative ? "sample" : "good"}>{workspace?.isIllustrative ? "Illustrative" : "Active scope"}</StatusChip></div>
          {!readOnly && <form className="inline-add-form" onSubmit={createOrganization}><FormField label="Create an organization workspace"><input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} maxLength={160} minLength={2} placeholder="Organization name" /></FormField><button className="button button-secondary button-small" disabled={createOrg.isPending || newWorkspaceName.trim().length < 2}><Plus size={14} /> Create</button></form>}
          <div className="workspace-selector-list">{workspaces.map((item) => <button className={`workspace-selector-row ${item.id === workspaceId ? "workspace-selected" : ""}`} key={item.id} onClick={() => setWorkspaceId(item.id)}><span className="workspace-selector-check">{item.id === workspaceId && <Check size={13} />}</span><span><strong>{item.name}</strong><small>{item.kind} · {item.isIllustrative ? "example records only" : item.role}</small></span><ArrowRight size={14} /></button>)}</div>
        </Panel>

        <Panel className="settings-panel"><div className="panel-heading"><div><div className="eyebrow">AUTHORITY BOUNDARY</div><h2>Members & roles</h2></div><span className="settings-mark"><ShieldCheck size={17} /></span></div>
          <p className="panel-intro">Owner/admin can change policies and authorize actions. Editors can enter records and propose follow-ups. Viewers can inspect records only.</p>
          {canManage && !readOnly && <form className="member-add-form" onSubmit={invite}><FormField label="Registered Manus account email"><input type="email" value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} required maxLength={320} placeholder="member@example.com" /></FormField><FormField label="Initial role"><select value={newMemberRole} onChange={(event) => setNewMemberRole(event.target.value as "admin" | "editor" | "viewer")}><option value="editor">Editor</option><option value="viewer">Viewer</option>{workspace?.role === "owner" && <option value="admin">Admin</option>}</select></FormField><button className="button button-secondary button-small" disabled={addMember.isPending}><UserPlus size={14} /> Add member</button><small>Operant does not send an invitation email; members authenticate with their own account.</small></form>}
          <div className="member-list">{members.data?.map((member) => <div className="member-row" key={member.id}><span className="avatar avatar-small">{(member.name || member.email || "M").slice(0, 1).toUpperCase()}</span><div className="member-info"><strong>{member.name || "Manus member"}</strong><small>{member.email || `Member #${member.userId}`}</small></div>{member.role === "owner" ? <StatusChip tone="good">Owner</StatusChip> : canManage && !readOnly ? <select className="role-select" aria-label={`Role for ${member.email || `member ${member.userId}`}`} value={member.role} onChange={(event) => setRole.mutate({ workspaceId: workspaceId!, memberId: member.id, role: event.target.value as "admin" | "editor" | "viewer" })}><option value="admin" disabled={workspace?.role !== "owner"}>Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select> : <StatusChip tone="neutral">{member.role}</StatusChip>}</div>)}</div>
          {members.data?.length === 0 && <div className="empty-small">No members found for this workspace.</div>}
        </Panel>
      </div>

      <div className="settings-column">
        <Panel className="settings-panel"><div className="panel-heading"><div><div className="eyebrow">INSPECTABLE RULES</div><h2>Deterministic thresholds</h2></div><span className="settings-mark"><Settings2 size={17} /></span></div>
          <p className="panel-intro">These rules generate the overview’s attention queue. Thresholds are explicit, adjustable, and never imply user priorities.</p>
          <div className="policy-setting"><div><strong>Due-soon window</strong><small>Flag open obligations due within this many days.</small></div><div className="policy-control"><input aria-label="Due soon days" type="number" min="1" max="90" value={policyValues.due_soon_days ?? dueSoon} onChange={(event) => setPolicyValues((value) => ({ ...value, due_soon_days: Number(event.target.value) }))} /><span>days</span><button className="button button-secondary button-small" disabled={readOnly || !canManage || updatePolicy.isPending} onClick={() => savePolicy("due_soon_days", dueSoon)}>Save</button></div></div>
          <div className="policy-setting"><div><strong>Evidence freshness threshold</strong><small>Older observations are surfaced as possibly outdated.</small></div><div className="policy-control"><input aria-label="Stale after days" type="number" min="1" max="3650" value={policyValues.stale_after_days ?? staleAfter} onChange={(event) => setPolicyValues((value) => ({ ...value, stale_after_days: Number(event.target.value) }))} /><span>days</span><button className="button button-secondary button-small" disabled={readOnly || !canManage || updatePolicy.isPending} onClick={() => savePolicy("stale_after_days", staleAfter)}>Save</button></div></div>
          <div className="policy-setting policy-setting-static"><div><strong>Action approval</strong><small>Every internal follow-up requires explicit owner/admin authorization.</small></div><StatusChip tone="good">Always required</StatusChip></div>
          {!canManage && !readOnly && <div className="permission-note">Your current role is {workspace?.role}. Policy edits require owner/admin authority.</div>}
        </Panel>

        <Panel className="settings-panel"><div className="panel-heading"><div><div className="eyebrow">USER-DEFINED DIRECTION</div><h2>Objectives</h2></div><span className="settings-mark"><CircleHelp size={17} /></span></div>
          <p className="panel-intro">Operant will not guess your goals. Add the objectives and preferences your workspace chooses to record.</p>
          {canManage && !readOnly && <form className="objective-form" onSubmit={submitObjective}><FormField label="Objective title"><input value={objectiveTitle} onChange={(event) => setObjectiveTitle(event.target.value)} required maxLength={180} placeholder="A priority or preference you choose" /></FormField><FormField label="Context (optional)"><input value={objectiveDescription} onChange={(event) => setObjectiveDescription(event.target.value)} maxLength={2000} placeholder="How should decisions account for it?" /></FormField><FormField label="Priority type"><select value={objectivePriority} onChange={(event) => setObjectivePriority(event.target.value as "required" | "preference")}><option value="required">Required objective</option><option value="preference">Preference</option></select></FormField><button className="button button-secondary button-small" disabled={addObjective.isPending}><Plus size={14} /> Add objective</button></form>}
          <div className="objective-list">{settings.data?.objectives.filter((item) => item.active).map((item) => <div className="objective-row" key={item.id}><span className="objective-symbol"><Check size={13} /></span><div><strong>{item.title}</strong><small>{item.description || "No additional context."}</small></div><StatusChip tone={item.priority === "required" ? "warn" : "info"}>{item.priority}</StatusChip>{canManage && !readOnly && <button className="icon-button" aria-label="Archive objective" title="Archive objective" onClick={() => removeObjective.mutate({ workspaceId: workspaceId!, objectiveId: item.id })}><Trash2 size={15} /></button>}</div>)}{settings.data?.objectives.filter((item) => item.active).length === 0 && <div className="empty-small">No objectives recorded. This is intentionally left blank rather than assuming your priorities.</div>}</div>
        </Panel>
      </div>
    </div>

    <GitHubConnectionsPanel />

    <Panel className="settings-panel sample-settings"><div className="panel-heading"><div><div className="eyebrow">EXPLORATION</div><h2>Illustrative sample workspace</h2></div><span className="settings-mark"><CircleHelp size={17} /></span></div><p className="panel-intro">Sample records are kept in a separate, read-only workspace. They are absent until you explicitly load them, are clearly labelled illustrative, and can be removed without affecting your real workspace.</p>
      <div className="sample-controls">{workspaces.some((item) => item.isIllustrative) ? <><StatusChip tone="sample">Separate example workspace is loaded</StatusChip><button className="button button-danger-outline button-small" onClick={() => { const sampleWorkspace = workspaces.find((item) => item.isIllustrative); if (sampleWorkspace && window.confirm("Remove the isolated illustrative workspace and all of its example records? Your real workspace will not be changed.")) removeSample.mutate({ workspaceId: sampleWorkspace.id }); }}><Trash2 size={14} /> Remove sample workspace</button></> : <button className="button button-secondary" disabled={createSample.isPending} onClick={() => createSample.mutate()}><Plus size={14} /> {createSample.isPending ? "Creating…" : "Load illustrative sample workspace"}</button>}</div>
    </Panel>
  </>;
}
