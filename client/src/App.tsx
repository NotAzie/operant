import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Route, Switch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { startLogin } from "./const";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import OperantShell from "./components/OperantShell";
import { WorkspaceProvider } from "./components/WorkspaceContext";
const Home = lazy(() => import("./pages/Home"));
const Entities = lazy(() => import("./pages/Entities"));
const Obligations = lazy(() => import("./pages/Obligations"));
const Actions = lazy(() => import("./pages/Actions"));
const Evidence = lazy(() => import("./pages/Evidence"));
const Events = lazy(() => import("./pages/Events"));
const Intelligence = lazy(() => import("./pages/Intelligence"));
const WorldModel = lazy(() => import("./pages/WorldModel"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

function LoginGate({ sessionError }: { sessionError?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="login-screen">
      <div className="login-card">
        <img className="login-logo" src="/brand-mark.svg" alt="" />
        <div className="eyebrow">OPERATIONAL INTELLIGENCE</div>
        <h1>Understand what is happening.<br /><em>Act with evidence.</em></h1>
        <p>{sessionError ? "Operant could not verify your session. Your operational data remains unavailable until the secure session check succeeds." : "Operant keeps your operational records scoped, attributable, and honest about what remains unknown."}</p>
        {sessionError && <div className="inline-error" role="alert">Session check failed: {sessionError}</div>}
        <button className="button button-primary login-button" onClick={() => { try { startLogin(); } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-in is not configured yet."); } }}>
          <LockKeyhole size={16} /> Sign in with Manus <ArrowRight size={16} />
        </button>
        {message && <div className="inline-error">{message}</div>}
        <div className="login-assurance"><ShieldCheck size={15} /><span>Your workspace is private to its authorized members.</span></div>
        <small>Authentication is required before operational data is available.</small>
      </div>
      <div className="login-side-note">A shared language for operational reality.<br />Not a claim to know reality perfectly.</div>
    </div>
  );
}

function AuthenticatedProduct({ user }: { user: NonNullable<ReturnType<typeof useAuthUser>> }) {
  const [location] = useLocation();
  return (
    <WorkspaceProvider>
      <OperantShell user={user}>
        <RecordAnchorScroll location={location} />
        <Suspense fallback={<div className="boot-screen"><div className="boot-mark"><img src="/brand-mark.svg" alt="" /></div><div><strong>Opening workspace view</strong><p>Loading the requested operational surface.</p></div></div>}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/entities" component={Entities} />
            <Route path="/obligations" component={Obligations} />
            <Route path="/actions" component={Actions} />
            <Route path="/events" component={Events} />
            <Route path="/intelligence" component={Intelligence} />
            <Route path="/world" component={WorldModel} />
            <Route path="/evidence" component={Evidence} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </OperantShell>
    </WorkspaceProvider>
  );
}

function RecordAnchorScroll({ location }: { location: string }) {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    let attempts = 0;
    const targetId = decodeURIComponent(hash.slice(1));
    const timer = window.setInterval(() => {
      const target = document.getElementById(targetId);
      attempts += 1;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.clearInterval(timer);
      } else if (attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [location]);
  return null;
}

function useAuthUser() {
  return trpc.auth.me.useQuery().data;
}

export default function App() {
  const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        {auth.isLoading ? (
          <div className="boot-screen"><div className="boot-mark"><img src="/brand-mark.svg" alt="" /></div><div><strong>Securely opening Operant</strong><p>Checking your Manus session.</p></div></div>
        ) : auth.data ? (
          <AuthenticatedProduct user={auth.data} />
        ) : auth.isError ? (
          <LoginGate sessionError={auth.error.message} />
        ) : (
          <LoginGate />
        )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}
