import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

export type WorkspaceSummary = {
  id: number;
  name: string;
  kind: "personal" | "organization";
  isIllustrative: boolean;
  role: "owner" | "admin" | "editor" | "viewer";
  createdAt: Date;
};

type WorkspaceContextValue = {
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceSummary | undefined;
  workspaceId: number | undefined;
  setWorkspaceId: (id: number) => void;
  loading: boolean;
  error: string | null;
  reload: () => Promise<unknown>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const SELECTED_WORKSPACE_KEY = "operant:selected-workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceIdState] = useState<number | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const saved = Number(window.localStorage.getItem(SELECTED_WORKSPACE_KEY));
    return Number.isInteger(saved) && saved > 0 ? saved : undefined;
  });
  const initialized = useRef(false);
  const workspaceQuery = trpc.operant.workspace.list.useQuery(undefined, { retry: 1, refetchOnWindowFocus: false });
  const initialize = trpc.operant.workspace.initialize.useMutation({
    onSuccess: () => void workspaceQuery.refetch(),
  });

  useEffect(() => {
    if (!workspaceQuery.data || workspaceQuery.data.length !== 0 || initialized.current || initialize.isPending) return;
    initialized.current = true;
    initialize.mutate();
  }, [workspaceQuery.data, initialize.isPending]);

  useEffect(() => {
    const all = workspaceQuery.data as WorkspaceSummary[] | undefined;
    if (!all?.length) return;
    if (workspaceId && all.some((item) => item.id === workspaceId)) return;
    const preferred = all.find((item) => !item.isIllustrative) ?? all[0];
    if (preferred) setWorkspaceId(preferred.id);
  }, [workspaceQuery.data, workspaceId]);

  const setWorkspaceId = (id: number) => {
    setWorkspaceIdState(id);
    try {
      window.localStorage.setItem(SELECTED_WORKSPACE_KEY, String(id));
    } catch {
      // The selection remains valid for this session if browser storage is unavailable.
    }
  };

  const workspaces = (workspaceQuery.data ?? []) as WorkspaceSummary[];
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const value = useMemo<WorkspaceContextValue>(() => ({
    workspaces,
    workspace,
    workspaceId: workspace?.id,
    setWorkspaceId,
    loading: workspaceQuery.isLoading || (workspaces.length === 0 && initialize.isPending),
    error: initialize.error?.message ?? workspaceQuery.error?.message ?? null,
    reload: () => workspaceQuery.refetch(),
  }), [workspaces, workspace, workspaceQuery.isLoading, workspaceQuery.error, initialize.isPending, initialize.error]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
