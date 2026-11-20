// Drizzle puts the SQL and its params (emails, session tokens, password hashes) in the
// error message and on `query`/`params`. Never log those.
// see PITFALLS.md: Database errors carry query params
const MAX_CAUSE_DEPTH = 5;
// Postgres codes ("57P01") and Node codes ("ECONNREFUSED"): short and safe to log
const SAFE_CODE = /^[A-Za-z0-9_]{1,32}$/;

// `truncated`: the chain went on past the depth cap, so we cannot say what is in the rest
function causeChain(error: unknown): { chain: unknown[]; truncated: boolean } {
  const chain: unknown[] = [];
  let current = error;
  while (chain.length < MAX_CAUSE_DEPTH && current instanceof Error) {
    chain.push(current);
    current = current.cause;
  }
  return { chain, truncated: current instanceof Error };
}

// Checked by name: Drizzle's class does not set `error.name`
function isQueryError(error: unknown): boolean {
  return error instanceof Error && error.constructor.name === "DrizzleQueryError";
}

function safeCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && SAFE_CODE.test(code) ? code : undefined;
}

// What to give pino as `err`. A database query error (also when wrapped in another error)
// becomes { type, code }, the code coming from the real cause. Other errors pass through.
// A chain deeper than the cap becomes { type: "TruncatedErrorChain" }: the rest is not inspected.
export function errorForLog(error: unknown): unknown {
  const { chain, truncated } = causeChain(error);
  if (truncated && !chain.some(isQueryError)) return { type: "TruncatedErrorChain" };
  if (!chain.some(isQueryError)) return error;
  return { type: "DrizzleQueryError", code: chain.map(safeCode).find((c) => c !== undefined) };
}
