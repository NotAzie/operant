import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { workspaces, workspaceMembers } from "../drizzle/schema";
import { getDb } from "./db";
import { canAccessRole, type MemberRole } from "./operantDomain";

export type OperantDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type WorkspaceAccess = {
  db: OperantDb;
  workspaceId: number;
  role: MemberRole;
  isIllustrative: boolean;
  createdBy: number;
};

export async function requireWorkspaceAccess(
  userId: number,
  workspaceId: number,
  minimum: MemberRole = "viewer",
): Promise<WorkspaceAccess> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Operational storage is unavailable." });

  const rows = await db
    .select({
      role: workspaceMembers.role,
      isIllustrative: workspaces.isIllustrative,
      createdBy: workspaces.createdBy,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);

  const membership = rows[0];
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace." });
  const role = membership.role as MemberRole;
  if (!canAccessRole(role, minimum)) throw new TRPCError({ code: "FORBIDDEN", message: "Your workspace role does not allow this operation." });

  return {
    db,
    workspaceId,
    role,
    isIllustrative: membership.isIllustrative,
    createdBy: membership.createdBy,
  };
}

export function requireWritableWorkspace(access: WorkspaceAccess): void {
  if (access.isIllustrative) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Illustrative workspaces are read-only. Switch to your workspace to make changes." });
  }
}

export function requireManager(access: WorkspaceAccess): void {
  if (access.role !== "owner" && access.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only a workspace owner or admin can change policy or authorize actions." });
  }
  requireWritableWorkspace(access);
}
