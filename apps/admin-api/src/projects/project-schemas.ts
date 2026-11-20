import type { Project } from "@gw/db";
import { z } from "zod";

// Soft cap: count then insert, so parallel creates can overshoot
// see PITFALLS.md: Soft limits can overshoot
export const MAX_PROJECTS_PER_USER = 100;

// Trimmed, 1 to 100 characters: the same range as the DB CHECK
// see PITFALLS.md: Zod and Postgres count length differently
export const projectName = z.string().trim().min(1).max(100);

// Strict: unknown keys (ownerId, id, ...) are a 400, not silently ignored
export const createProjectBody = z.strictObject({ name: projectName });

// Only these fields leave the API; the serializer drops the rest of the row (ownerId)
export const projectResponse = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const projectListResponse = z.object({ projects: z.array(projectResponse) });

export function toProjectResponse(project: Project): z.infer<typeof projectResponse> {
  const { id, name, createdAt, updatedAt } = project;
  return { id, name, createdAt, updatedAt };
}
