import type { Queryable } from "../client.ts";
import { projects } from "../schema/index.ts";
import { isUniqueViolation } from "../unique-violation.ts";
import type { Project } from "./projects.ts";

// The only code that writes owner_id (with project-access.ts, the only code naming it).
// Pass the logged-in user's ID, never a value from a request body.
// see PITFALLS.md: Project access goes through one condition
export async function insertProject(db: Queryable, userId: string, name: string): Promise<Project> {
  const [project] = await db.insert(projects).values({ ownerId: userId, name }).returning();
  if (!project) throw new Error("insert into projects returned no row");
  return project;
}

// True if `error` is "this user already has a project with this name" (from insert or rename).
// Lives here because the constraint name contains the owner column.
// see PITFALLS.md: Unique violations are found by constraint name
export function isProjectNameTaken(error: unknown): boolean {
  return isUniqueViolation(error, "projects_owner_id_name_unique");
}
