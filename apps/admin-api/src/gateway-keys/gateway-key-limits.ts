// Exact cap on active (not revoked) keys, counted and inserted under a per-project lock
// see PITFALLS.md: Limits are counted under a lock
export const MAX_ACTIVE_GATEWAY_KEYS = 20;
