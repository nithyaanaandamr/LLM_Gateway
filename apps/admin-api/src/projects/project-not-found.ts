import { AppError } from "../errors.ts";

// "Not yours" and "doesn't exist" must give the exact same answer.
// see PITFALLS.md: Not your project is 404, not 403
export function projectNotFound(): AppError {
  return new AppError(404, "NOT_FOUND", "Project not found");
}
