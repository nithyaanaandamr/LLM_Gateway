// Test-only (excluded from the build). Never import from app code.
// Request helpers for real-process tests (plain fetch over real HTTP).

// Any session_token cookie with a value (the name may carry a __Secure- prefix)
export const COOKIE_WITH_VALUE = /session_token=[^\s"\\;]+/;

export interface RequestOptions {
  method: string;
  origin: string; // the dashboard Origin, which requireTrustedOrigin needs on unsafe methods
  body?: unknown; // JSON; leave out to send no body and no content-type
  cookie?: string | undefined;
}

export function request(url: string, options: RequestOptions): Promise<Response> {
  const { method, origin, body, cookie } = options;
  return fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      origin,
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// "name=value" from the response's session cookie, as a browser would send it back
export function sessionCookieOf(res: Response): string {
  const found = res.headers.getSetCookie().find((c) => c.includes("session_token="));
  if (!found) throw new Error("no session cookie in response");
  return found.split(";")[0] ?? "";
}

// Every string a leak could show up as: raw, URL-encoded and decoded forms of a cookie value
export function forms(value: string): string[] {
  return [value, encodeURIComponent(value), decodeURIComponent(value)];
}
