import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { projects } from "../schema/index.ts";
import { accessibleProjects } from "./project-access.ts";

export type Project = typeof projects.$inferSelect;

// The only write that names the owner. Callers pass the logged-in user's ID, never a body field.
export async function insertProject(
  db: Database,
  values: { ownerId: string; name: string },
): Promise<Project> {
  const [project] = await db.insert(projects).values(values).returning();
  if (!project) throw new Error("insert into projects returned no row");
  return project;
}

export function listAccessibleProjects(db: Database, userId: string): Promise<Project[]> {
  return db.select().from(projects).where(accessibleProjects(userId)).orderBy(asc(projects.name));
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

export function countAccessibleProjects(db: Database, userId: string): Promise<number> {
  return db.$count(projects, accessibleProjects(userId));
}

// Callers must have checked access first (findAccessibleProject). Returns the updated row.
export async function renameProject(
  db: Database,
  projectId: string,
  name: string,
): Promise<Project | undefined> {
  const [project] = await db
    .update(projects)
    .set({ name })
    .where(eq(projects.id, projectId))
    .returning();
  return project;
}

// Callers must have checked access first. True if a row was deleted.
export async function deleteProject(db: Database, projectId: string): Promise<boolean> {
  const deleted = await db
    .delete(projects)
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  return deleted.length > 0;
}
