// Deliberate cycle for boundaries.test.ts: a imports b, b imports a.
import { b } from "./b.ts";

export const a = (): string => b();
