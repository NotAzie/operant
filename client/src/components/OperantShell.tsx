import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  BriefcaseBusiness,
  Boxes,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileText,
  Gauge,
  GitBranch,
  LogOut,
  Inbox,
  Plus,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "./WorkspaceContext";

type ShellProps = { children: React.ReactNode; user: { name?: string | null; email?: string | null } | null };

const navItems = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/world", label: "World model", icon: Boxes },
  { href: "/events", label: "Events", icon: Inbox },
  { href: "/intelligence", label: "Intelligence", icon: BrainCircuit },
  { href: "/entities", label: "Entities", icon: GitBranch },
  { href: "/obligations", label: "Obligations", icon: ReceiptText },
  { href: "/actions", label: "Actions", icon: Activity },
  { href: "/evidence", label: "Evidence", icon: FileText },
  { href: "/settings", label: "Workspace settings", icon: Settings2 },
];

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`panel ${className}`}>{children}</section>;
}

export function EmptyState({ icon: Icon = CircleHelp, title, detail, action }: { icon?: typeof CircleHelp; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={19} strokeWidth={1.7} /></span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function StatusChip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" | "sample" }) {
  return <span className={`status-chip status-${tone}`}>{children}</span>;
}

export function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export default function OperantShell({ children, user }: ShellProps) {
  const [pathname] = useLocation();
  const { workspaces, workspace, workspaceId, setWorkspaceId, loading, error } = useWorkspace();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { window.location.href = "/"; } });
  const displayName = user?.name?.trim() || user?.email || "Workspace member";
  const initials = displayName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "O";

  if (loading) {
    return <div className="boot-screen"><div className="boot-mark"><img src="/brand-mark.svg" alt="" /></div><div><strong>Opening your workspace</strong><p>Loading scoped operational records.</p></div></div>;
  }
  if (!workspace) {
    return <div className="boot-screen"><div className="boot-mark"><img src="/brand-mark.svg" alt="" /></div><div><strong>Workspace unavailable</strong><p>{error || "Your workspace could not be loaded."}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></div></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img className="brand-icon" src="/brand-mark.svg" alt="" />
          <div><span className="brand-name">Operant</span><span className="brand-tagline">Operational intelligence</span></div>
        </div>
        <div className="workspace-side-label">WORKSPACE</div>
        <div className="sidebar-workspace">
          <span className="workspace-symbol"><BriefcaseBusiness size={16} /></span>
          <span className="workspace-text"><strong>{workspace.name}</strong><small>{workspace.isIllustrative ? "Illustrative only" : workspace.kind === "personal" ? "Personal workspace" : "Organization workspace"}</small></span>
          <ChevronDown size={14} className="workspace-chevron" />
        </div>
        <div className="sidebar-group-label">YOUR OPERATIONS</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return <Link key={item.href} href={item.href} className={`nav-item ${active ? "nav-active" : ""}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.href === "/actions" && <span className="nav-dot" />}</Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-note"><ShieldCheck size={17} /><div><strong>Permission-aware</strong><span>Actions require approval</span></div></div>
          <div className="sidebar-profile">
            <span className="avatar">{initials}</span><div className="profile-copy"><strong>{displayName}</strong><span>{workspace.role}</span></div>
            <button aria-label="Sign out" title="Sign out" className="icon-button sidebar-logout" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{navItems.find((item) => item.href === pathname)?.label || "Operational view"}</strong></div>
          <div className="topbar-tools">
            <div className="sync-status"><span className="sync-dot" />Manual + GitHub events</div>
            <label className="workspace-switcher"><Users size={15} /><select aria-label="Select workspace" value={workspaceId} onChange={(event) => setWorkspaceId(Number(event.target.value))}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.isIllustrative ? `Sample · ${item.name}` : item.name}</option>)}</select><ChevronDown size={13} /></label>
            <span className="avatar avatar-small" title={displayName}>{initials}</span>
          </div>
        </header>
        {workspace.isIllustrative && <div className="sample-banner"><span className="sample-banner-mark"><CircleHelp size={15} /></span><span><strong>Illustrative workspace</strong> — all records below are examples, not live operational data.</span><span className="sample-banner-spacer" /><span className="sample-lock"><CheckCircle2 size={14} /> Read-only</span></div>}
        <main className="page-content" key={workspace.id}>{children}</main>
        <footer className="app-footer"><span><ShieldCheck size={14} /> Evidence remains attributable</span><span>Operant · Scoped workspace model</span><a href="/settings">Data sources <ArrowUpRight size={12} /></a></footer>
      </div>
    </div>
  );
}
