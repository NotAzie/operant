import { useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink, Github, KeyRound, Link2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FormField, Panel, StatusChip } from "@/components/OperantShell";
import { useWorkspace } from "@/components/WorkspaceContext";

type SecretDelivery = { webhookSecret: string; webhookPath: string; note: string };
function statusTone(value: string) {
  if (value === "active") return "good" as const;
  if (value === "reauthorization_required") return "warn" as const;
  if (value === "disconnected") return "neutral" as const;
  return "bad" as const;
}

export default function GitHubConnectionsPanel() {
  const { workspace, workspaceId } = useWorkspace();
  const enabled = Boolean(workspaceId);
  const connections = trpc.operant.integrations.github.connections.useQuery({ workspaceId: workspaceId ?? 0 }, { enabled, refetchOnWindowFocus: true });
  const utils = trpc.useUtils();
  const [message, setMessage] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<SecretDelivery | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const readOnly = Boolean(workspace?.isIllustrative);
  const canManage = workspace?.role === "owner" || workspace?.role === "admin";
  const refresh = async () => { await Promise.all([utils.operant.integrations.github.connections.invalidate(), utils.operant.events.list.invalidate(), utils.operant.events.health.invalidate()]); };
  const connect = trpc.operant.integrations.github.connect.useMutation({ onSuccess: async (result) => { setToken(""); setDelivery({ webhookSecret: result.webhookSecret, webhookPath: result.webhookPath, note: result.note }); setMessage(`Connected ${result.connection.repositoryUrl}. Copy the one-time webhook secret below and configure the GitHub webhook.`); await refresh(); } });
  const rotate = trpc.operant.integrations.github.rotateWebhookSecret.useMutation({ onSuccess: async (result) => { setDelivery({ webhookSecret: result.webhookSecret, webhookPath: result.webhookPath, note: result.note }); setMessage("Webhook signing secret replaced. Update the GitHub webhook configuration now."); await refresh(); } });
  const disconnect = trpc.operant.integrations.github.disconnect.useMutation({ onSuccess: async () => { setDelivery(null); setMessage("Stored application credentials removed. The token was not revoked in GitHub."); await refresh(); } });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !token.trim() || readOnly || !canManage) return;
    const form = new FormData(event.currentTarget);
    connect.mutate({ workspaceId, repositoryUrl: String(form.get("repositoryUrl") ?? "").trim(), accessToken: token.trim() });
  };
  const errors = connect.error?.message || rotate.error?.message || disconnect.error?.message || connections.error?.message;
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setCopyMessage(`${label} copied.`); }
    catch { setCopyMessage("Clipboard access was blocked; select and copy the displayed value manually."); }
  };
  const webhookUrl = delivery ? `${window.location.origin}${delivery.webhookPath}` : "";

  return <Panel className="settings-panel github-connection-panel">
    <div className="panel-heading"><div><div className="eyebrow">GITHUB ISSUES · APPLICATION CONNECTION</div><h2>Repository and webhook</h2></div><span className="settings-mark"><Github size={17} /></span></div>
    <p className="panel-intro">Connect one repository with an authenticated, repository-scoped token. Operant validates repository metadata and issue-read access without sending a test write. Public GitHub comments require the token’s Issues: write permission and remain separately proposed, hash-bound, approved and verified.</p>
    {readOnly && <div className="permission-note">Illustrative workspace: provider connections and external actions are disabled.</div>}
    {message && <div className="success-message"><Check size={14} /> {message}</div>}
    {errors && <div className="inline-error">{errors}</div>}
    <div className="github-connection-list">
      {connections.isLoading ? <div className="empty-small">Loading connection status…</div> : connections.data?.length ? connections.data.map((connection) => <article className="github-connection-row" key={connection.id}>
        <div className="github-connection-main"><span className="integration-status-icon"><Link2 size={16} /></span><div><strong><a href={connection.repositoryUrl} target="_blank" rel="noreferrer">{connection.repositoryOwner}/{connection.repositoryName} <ExternalLink size={11} /></a></strong><small>Repository ID {connection.repositoryId} · checked {connection.lastValidatedAt ? new Date(connection.lastValidatedAt).toLocaleString() : "not yet"}</small></div><StatusChip tone={statusTone(connection.status)}>{connection.status.replaceAll("_", " ")}</StatusChip></div>
        <div className="github-connection-meta"><span>Last accepted webhook <strong>{connection.lastWebhookAt ? new Date(connection.lastWebhookAt).toLocaleString() : "None received"}</strong></span>{connection.lastErrorCode && <span className="event-error">{connection.lastErrorCode}{connection.lastErrorAt ? ` · ${new Date(connection.lastErrorAt).toLocaleString()}` : ""}</span>}</div>
        {canManage && !readOnly && connection.status === "active" && <div className="github-connection-controls"><button className="button button-secondary button-small" disabled={rotate.isPending} onClick={() => { if (window.confirm("Replace the saved webhook secret? The current secret will stop validating deliveries immediately. GitHub will need its new secret updated.")) rotate.mutate({ workspaceId: workspaceId!, connectionId: connection.id }); }}><RefreshCw size={13} /> Rotate webhook secret</button><button className="text-button text-danger" disabled={disconnect.isPending} onClick={() => { if (window.confirm(`Remove Operant's stored token and signing secret for ${connection.repositoryOwner}/${connection.repositoryName}? This does not revoke the token in GitHub or delete GitHub data.`)) disconnect.mutate({ workspaceId: workspaceId!, connectionId: connection.id }); }}><Unplug size={13} /> Disconnect</button></div>}
      </article>) : <div className="empty-small">No GitHub repository is connected to this workspace.</div>}
    </div>
    {canManage && !readOnly && <form className="github-connect-form" onSubmit={submit}>
      <div className="eyebrow">CONNECT OR RECONNECT</div><div className="github-connect-fields">
        <FormField label="GitHub repository URL"><input type="url" name="repositoryUrl" required maxLength={500} placeholder="https://github.com/owner/repository" /></FormField>
        <FormField label="Repository-scoped personal access token" hint="Must read the selected repository and its issues. To execute an approved comment, grant Issues: write. Setup never creates a test comment; the token is never displayed after submit."><input type="password" name="accessToken" value={token} onChange={(event) => setToken(event.target.value)} required minLength={20} maxLength={512} autoComplete="new-password" spellCheck={false} placeholder="ghp_… or fine-grained token" /></FormField>
        <button className="button button-primary button-small" type="submit" disabled={connect.isPending || token.length < 20}><KeyRound size={14} /> {connect.isPending ? "Validating and encrypting…" : "Validate and connect"}</button>
      </div>
    </form>}
    {delivery && <div className="one-time-secret" role="status">
      <div className="one-time-secret-heading"><ShieldCheck size={16} /><strong>One-time webhook signing secret</strong><StatusChip tone="warn">Copy now</StatusChip></div>
      <p>{delivery.note}</p>
      <div className="secret-value-row"><code>{delivery.webhookSecret}</code><button type="button" className="button button-secondary button-small" onClick={() => void copy(delivery.webhookSecret, "Webhook secret")}><Copy size={13} /> Copy secret</button></div>
      <div className="webhook-setup-grid"><div><small>Payload URL · replace preview host if using another public HTTPS origin</small><div className="secret-value-row"><code>{webhookUrl}</code><button type="button" className="icon-button" aria-label="Copy webhook URL" onClick={() => void copy(webhookUrl, "Webhook URL")}><Copy size={13} /></button></div></div><div><small>GitHub repository → Settings → Webhooks</small><strong>Content type: application/json · Select only “Issues” event</strong></div></div>
      <div className="permission-note">Use the deployed HTTPS origin reachable by GitHub. If a secret is rotated, update the webhook immediately; the old secret is no longer accepted. The secret is not stored in browser local storage and disappears when this view is left.</div>
      {copyMessage && <small className="copy-message">{copyMessage}</small>}
    </div>}
    <div className="integration-explainer"><strong>Webhook event:</strong> GitHub <code>issues</code>; signature is verified against raw bytes before parsing. Deliveries are repository-checked, idempotently persisted, and acknowledged independently of downstream processing. <strong>Not subscribed:</strong> issue comments; outgoing comments use the managed action flow.</div>
  </Panel>;
}
