// Exact cap: counted and inserted under a per-user lock (insertProjectWithinLimit)
// see PITFALLS.md: Limits are counted under a lock
export const MAX_PROJECTS_PER_USER = 100;
