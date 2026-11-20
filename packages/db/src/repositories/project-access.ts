import { eq, type SQL } from "drizzle-orm";
import { projects } from "../schema/index.ts";

// The one place that decides who can access a project (ADR 0011; the ADR calls it
// canAccessProject). A SQL condition, so one query both checks access and loads the row.
// Teams later: only this changes. Internal: not exported from the package index.
// see PITFALLS.md: Project access goes through one condition
export function accessibleProjects(userId: string): SQL {
  return eq(projects.ownerId, userId);
}
