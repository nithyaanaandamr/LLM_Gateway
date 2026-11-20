import { isProjectNameTaken } from "@gw/db";
import { AppError } from "../errors.ts";

// see PITFALLS.md: Unique violations are found by constraint name
// Used by create and rename: a duplicate name is a 409, anything else is not ours to handle.
// The duplicate comes from the unique constraint, so two parallel requests can't both succeed.
export function nameConflictOrRethrow(error: unknown): never {
  if (isProjectNameTaken(error)) {
    throw new AppError(409, "CONFLICT", "A project with this name already exists");
  }
  throw error;
}
