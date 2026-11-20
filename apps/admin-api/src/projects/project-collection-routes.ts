import {
  insertProjectWithinLimit,
  listAccessibleProjects,
  type Database,
  type Project,
} from "@gw/db";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { getAuthUser } from "../auth/get-auth-user.ts";
import { AppError } from "../errors.ts";
import { nameConflictOrRethrow } from "./name-conflict.ts";
import {
  projectNameBody,
  MAX_PROJECTS_PER_USER,
  projectListResponse,
  projectResponse,
  toProjectResponse,
} from "./project-schemas.ts";

export interface ProjectCollectionRoutesOptions {
  db: Database;
}

// The cap is exact (the repository locks per user); a duplicate name becomes a 409 (see name-conflict.ts)
async function createProjectFor(db: Database, userId: string, name: string): Promise<Project> {
  const result = await insertProjectWithinLimit(db, userId, name, MAX_PROJECTS_PER_USER).catch(
    nameConflictOrRethrow,
  );
  if (result.status === "limit_reached") {
    throw new AppError(409, "CONFLICT", `Project limit reached (${MAX_PROJECTS_PER_USER})`);
  }
  return result.project;
}

export const projectCollectionRoutes: FastifyPluginCallbackZod<ProjectCollectionRoutesOptions> = (
  app,
  { db },
  done,
) => {
  app.get(
    "/api/projects",
    { schema: { response: { 200: projectListResponse } } },
    async (request) => {
      const projects = await listAccessibleProjects(db, getAuthUser(request).id);
      return { projects: projects.map(toProjectResponse) };
    },
  );

  app.post(
    "/api/projects",
    { schema: { body: projectNameBody, response: { 201: projectResponse } } },
    async (request, reply) => {
      // The owner is always the logged-in user, never a body field
      const project = await createProjectFor(db, getAuthUser(request).id, request.body.name);
      return reply.code(201).send(toProjectResponse(project));
    },
  );
  done();
};
