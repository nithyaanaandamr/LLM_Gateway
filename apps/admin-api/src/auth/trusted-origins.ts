import type { Config } from "../config.ts";

// Origins Better Auth and our own Origin check accept for requests that carry a cookie
export function trustedOrigins(config: Pick<Config, "authBaseUrl" | "dashboardOrigin">): string[] {
  return [config.authBaseUrl, config.dashboardOrigin];
}
