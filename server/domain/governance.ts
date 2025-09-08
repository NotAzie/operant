export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type GovernedActionType = "internal_follow_up" | "github_issue_comment";
export type RiskLevel = "low" | "moderate" | "high" | "critical";

const rank: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return rank[role] >= rank[minimum];
}

export function evaluateActionAuthority(role: WorkspaceRole, actionType: GovernedActionType) {
  const isExternal = actionType !== "internal_follow_up";
  return {
    canPropose: roleAtLeast(role, "editor"),
    canAuthorize: roleAtLeast(role, "admin"),
    canExecute: roleAtLeast(role, "admin"),
    approvalRequired: isExternal,
    requiredRole: isExternal ? ("admin" as const) : ("admin" as const),
    riskLevel: isExternal ? ("high" as const) : ("low" as const),
    autonomyLevel: "human_approval_required" as const,
  };
}

/** Models and deterministic rules may suggest; they cannot grant authority. */
export function isAuthorizedForExternalExecution(role: WorkspaceRole, explicitlyAuthorized: boolean): boolean {
  return roleAtLeast(role, "admin") && explicitlyAuthorized;
}

// Evaluates canonical SHA-256 payload digest before recording manager authorization receipt
