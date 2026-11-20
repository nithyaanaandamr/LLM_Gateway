import type { Project } from "@gw/db";
import { z } from "zod";

// Soft cap: count then insert, so parallel creates can overshoot
// see PITFALLS.md: Soft limits can overshoot
export const MAX_PROJECTS_PER_USER = 100;

// Control characters (NUL makes Postgres fail with a 500; newlines and BEL break logs and UIs)
// and bidi overrides and isolates (they make a name display as something else) are refused.
// Other format characters (ZWJ in emoji, ZWNJ in Persian and Indic scripts) are real text.
// see PITFALLS.md: Names refuse control and bidi characters
const FORBIDDEN_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

// Shared name rule. Order matters: the control check sees the raw text (a trailing newline is
// refused, not trimmed away), then trim, then NFC so "café" typed either way is one name,
// then the 1 to 100 length check on the normalized text.
// Length counts code points like the DB CHECK (Zod falls back to code points past the limit).
// see PITFALLS.md: Zod and Postgres agree on name length (code points)
export const projectName = z
  .string()
  .refine((name) => !FORBIDDEN_CHARACTERS.test(name), "must not contain control characters")
  .trim()
  .normalize("NFC")
  .min(1)
  .max(100);

// Body of create and rename. Strict: unknown keys (the owner, id, ...) are a 400, not silently ignored
export const projectNameBody = z.strictObject({ name: projectName });

// Only these fields leave the API; the serializer drops the rest of the row (the owner)
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
