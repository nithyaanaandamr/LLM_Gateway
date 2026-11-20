import { and, asc, eq, sql } from "drizzle-orm";
import type { Database, Queryable } from "../client.ts";
import { projects } from "../schema/index.ts";
import { insertProject } from "./insert-project.ts";
import { lockForLimit } from "./limit-lock.ts";
import { accessibleProjects } from "./project-access.ts";

export { insertProject, isProjectNameTaken } from "./insert-project.ts";

export type Project = typeof projects.$inferSelect;

// COLLATE "C" sorts by bytes, so the order is the same on every Postgres. The database's
// default collation differs between installs (Alpine: bytes, glibc: a, A, b, B).
// Names are unique per owner, so name alone is a total order; id is a harmless tie-break.
// see PITFALLS.md: List order must not depend on the collation
export function listAccessibleProjects(db: Database, userId: string): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(accessibleProjects(userId))
    .orderBy(sql`${projects.name} collate "C"`, asc(projects.id));
}

// undefined for someone else's project and for a missing one: the caller can't tell them apart
export async function findAccessibleProject(
  db: Database,
  userId: string,
  projectId: string,
): Promise<Project | undefined> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(accessibleProjects(userId), eq(projects.id, projectId)));
  return project;
}

export function countAccessibleProjects(db: Queryable, userId: string): Promise<number> {
  return db.$count(projects, accessibleProjects(userId));
}

// Checks access itself, so it is safe even if a caller skips findAccessibleProject.
// Returns the updated row, or undefined for someone else's project or a missing one.
export async function renameProject(
  db: Database,
  userId: string,
  projectId: string,
  name: string,
): Promise<Project | undefined> {
  const [project] = await db
    .update(projects)
    .set({ name })
    .where(and(accessibleProjects(userId), eq(projects.id, projectId)))
    .returning();
  return project;
}

// Checks access itself. True if a row was deleted; false for someone else's project or a missing one.
export async function deleteProject(
  db: Database,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(projects)
    .where(and(accessibleProjects(userId), eq(projects.id, projectId)))
    .returning({ id: projects.id });
  return deleted.length > 0;
}

export type InsertWithinLimitResult =
  { status: "created"; project: Project } | { status: "limit_reached" };

// Exact cap: the user's lock, the count and the insert run in one transaction, so parallel
// creates for the same user take turns. A duplicate name still throws (the unique constraint
// rolls the transaction back); see isProjectNameTaken.
// see PITFALLS.md: Limits are counted under a lock
export function insertProjectWithinLimit(
  db: Database,
  userId: string,
  name: string,
  limit: number,
): Promise<InsertWithinLimitResult> {
  return db.transaction(async (tx) => {
    await lockForLimit(tx, "projects", userId);
    if ((await countAccessibleProjects(tx, userId)) >= limit) return { status: "limit_reached" };
    return { status: "created", project: await insertProject(tx, userId, name) };
  });
}
