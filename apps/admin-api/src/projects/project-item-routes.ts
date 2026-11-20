import { deleteProject, renameProject, type Database } from "@gw/db";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { getAuthUser } from "../auth/get-auth-user.ts";
import { getProject } from "./get-project.ts";
import { nameConflictOrRethrow } from "./name-conflict.ts";
import { projectNotFound } from "./project-not-found.ts";
import { projectNameBody, projectResponse, toProjectResponse } from "./project-schemas.ts";

export interface ProjectItemRoutesOptions {
  db: Database;
}

export const projectItemRoutes: FastifyPluginCallbackZod<ProjectItemRoutesOptions> = (
  app,
  { db },
  done,
) => {
  app.get(
    "/api/projects/:projectId",
    { schema: { response: { 200: projectResponse } } },
    (request) => toProjectResponse(getProject(request)),
  );

  app.patch(
    "/api/projects/:projectId",
    { schema: { body: projectNameBody, response: { 200: projectResponse } } },
    async (request) => {
      // getProject(...).id comes from the database; the URL's projectId may be uppercase
      const project = getProject(request);
      const renamed = await renameProject(
        db,
        getAuthUser(request).id,
        project.id,
        request.body.name,
      ).catch(nameConflictOrRethrow);
      if (!renamed) throw projectNotFound(); // deleted since the scope check;
      return toProjectResponse(renamed);
    },
  );

  app.delete("/api/projects/:projectId", async (request, reply) => {
    const deleted = await deleteProject(db, getAuthUser(request).id, getProject(request).id);
    if (!deleted) throw projectNotFound(); // deleted since the scope check;
    return reply.code(204).send();
  });
  done();
};
