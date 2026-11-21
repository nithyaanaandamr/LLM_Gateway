# 0014. Code layers and boundary lint

- **Status:** Accepted
- **Date:** 2026-11-21
- **Task:** GW-041

## Context

Phase 1.5 comes before Phase 2, while the code is small. The layering (startup, HTTP, services, repositories, schema) and the import rules existed only in words: READMEs, CLAUDE.md and sprint notes. Nothing checked them, and a newcomer had to infer them from the code.

One rule has a loophole. "Apps never import `drizzle-orm` at runtime" is true today, but the `db` object that routes receive is a full Drizzle client, so a route could write `db.select().from(...)` or `db.query.projects.findFirst(...)` with no import at all. Phase 2 adds two more apps (gateway, worker), which makes drift more likely.

Full spec: [code-structure.md](../architecture/code-structure.md).

## Options

**(a) When does a route need a service?**

| Option | Pros | Cons |
|---|---|---|
| A. Only when it uses another package or makes 2+ repository calls | Matches all current code; nothing moves | A judgement call at review, guided by two clear triggers |
| B. Always | Uniform | 6-8 thin pass-through functions that add no safety |
| C. Whenever there is branching | Catches logic early | Moves code; the line is blurry ("is a 404 check logic?") |

**(b) Lint tool**

| Option | Pros | Cons |
|---|---|---|
| A. ESLint core `no-restricted-imports` + `eslint-plugin-import-x` | Smallest new vocabulary; messages show in the editor; works on ESLint 10 | Matches import text, so it relies on our path style |
| B. `eslint-plugin-boundaries` + import-x | Matches resolved files | More concepts to learn and defend; only smoke-tested on ESLint 10 |
| C. `dependency-cruiser` | Catches type-only cycles | Outside the editor; extra CI step |

**(c) Which cycles count**

| Option | Pros | Cons |
|---|---|---|
| A. Runtime imports only | Type-only cycles vanish at runtime; no code change | A type-only cycle (one exists in `packages/db`) is not reported |
| B. Type-only too | Stricter | Needs dependency-cruiser and moving the `Project` type |

**(d) Closing the `db` loophole**

| Option | Pros | Cons |
|---|---|---|
| A. Name-based lint rule on `db.query`, `db.select`, ... | Cheap | A variable not named `db` escapes |
| B. Move tables to a `@gw/db/schema` subpath and ban it | Blocks table imports structurally | Touches test imports and the auth config; queries still possible |
| C. Imports only (today's wording) | No work | The loophole stays; caught only in review |
| D. Opaque `Database` handle | Compile error, not a heuristic | About 18 repository functions, 14 test lines and `@gw/auth` change |

## Decision

1. **Services (a):** A. A route may call a repository directly; add a service when the work uses another package or needs 2+ repository calls.
2. **Lint tool (b):** A. Core `no-restricted-imports` plus `eslint-plugin-import-x` (`no-cycle`, `no-relative-packages`). GW-042 adds the rules, each proved by one deliberately bad import.
3. **Database handle (d):** D. `@gw/db` gives apps an opaque `Database` type with no query methods. Repository functions unwrap it inside `@gw/db`; tests unwrap it through `@gw/db/testing`; `@gw/auth` gets the real client through an export that lint bans in apps. Built by GW-045. The `drizzle-orm`/`pg` import ban stays as well.
4. **Cycles (c):** A. Runtime cycles only.
5. **Naming inconsistencies:** leave them and list them as named exceptions in `code-structure.md`.

## Consequences

- Import rules match import text, so the bad-import tests in GW-042 guard them. Revisit if path aliases are added.
- `import-x` can find nothing if its parser and resolver settings are wrong, so keep a `no-cycle` case in the bad-import tests.
- The opaque handle makes app queries a compile error. Tests and `@gw/auth` unwrap it on purpose, and lint keeps apps away from those exports.
- The gateway's "no direct Postgres writes" rule cannot be linted with a single `@gw/db` entry point; it stays a review rule until Phase 2 decides on a read-only export.
- The type-only cycle in `packages/db` is left as is.
