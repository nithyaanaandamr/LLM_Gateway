// Test-only (excluded from the build). Never import from app code.
import { randomUUID } from "node:crypto";
import type { App } from "../app.ts";
import type { Config } from "../config.ts";
import { apiRequest } from "./api-requests.ts";

// A project as it comes back over HTTP: dates are ISO strings
export interface ProjectJson {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// Creates a project through the API and returns it; fails the test if the API refuses
export async function createProject(
  app: App,
  config: Config,
  cookie: string,
  name: string = `project-${randomUUID()}`,
): Promise<ProjectJson> {
  const res = await apiRequest(app, config, {
    method: "POST",
    url: "/api/projects",
    cookie,
    payload: { name },
  });
  if (res.statusCode !== 201)
    throw new Error(`create project failed: ${res.statusCode} ${res.body}`);
  return res.json<ProjectJson>();
}
