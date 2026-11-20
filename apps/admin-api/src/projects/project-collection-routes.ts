import {
  countAccessibleProjects,
  insertProject,
  isUniqueViolation,
  listAccessibleProjects,
  type Database,
  type Project,
} from "@gw/db";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { getAuthUser } from "../auth/get-auth-user.ts";
import { AppError } from "../errors.ts";
import {
  createProjectBody,
  MAX_PROJECTS_PER_USER,
  projectListResponse,
  projectResponse,
  toProjectResponse,
} from "./project-schemas.ts";

const NAME_CONSTRAINT = "projects_owner_id_name_unique";

export interface ProjectCollectionRoutesOptions {
  db: Database;
}

// Cap check, then insert. The duplicate name is caught from the unique constraint, not by
// looking first, so two parallel creates can't both succeed.
// see PITFALLS.md: Unique violations are found by constraint name
async function createProjectFor(db: Database, userId: string, name: string): Promise<Project> {
  if ((await countAccessibleProjects(db, userId)) >= MAX_PROJECTS_PER_USER) {
    throw new AppError(409, "CONFLICT", `Project limit reached (${MAX_PROJECTS_PER_USER})`);
  }
  try {
    return await insertProject(db, { ownerId: userId, name });
  } catch (error) {
    if (isUniqueViolation(error, NAME_CONSTRAINT)) {
      throw new AppError(409, "CONFLICT", "A project with this name already exists");
    }
    throw error;
  }
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
    { schema: { body: createProjectBody, response: { 201: projectResponse } } },
    async (request, reply) => {
      // The owner is always the logged-in user, never a body field
      const project = await createProjectFor(db, getAuthUser(request).id, request.body.name);
      return reply.code(201).send(toProjectResponse(project));
    },
  );
  done();
};
