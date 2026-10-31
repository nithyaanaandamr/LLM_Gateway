# 0012. Packages and apps compile to dist

- **Status:** Accepted
- **Date:** 2026-10-31
- **Task:** GW-013 (raised in the GW-015 brief)

## Context

`tools/board-bot`, GW-013 (`packages/db`) and GW-016 (`apps/admin-api`) first ran `.ts` files directly through Node's *type stripping* (Node deletes the type annotations and runs what's left). For GW-015 the owner chose compiled output for production: packages and apps compile to `dist/`, and production runs `node dist/main.js`.

Terms used below:
- **Project references:** a tsconfig lists the other packages it depends on, so `tsc -b` ("build mode") builds those first, and skips anything already up to date.
- **`composite`:** the tsconfig setting that lets a package be one of those references (it makes `tsc` write type files and a build record).

## Options

| Option | Pros | Cons |
|---|---|---|
| Run `.ts` directly | No build step | Production relies on a Node feature meant for dev; type stripping has limits |
| `tsc` + project references (chosen) | No new tool; emits `.js`, `.d.ts` and source maps; `tsc -b` builds dependencies first | Two tsconfigs per package; stale `dist/` must be designed out |
| Bundler (`tsup`, `esbuild`) | Single-file output | Extra dependency; types need extra setup |
| `tsx` at runtime | Easy | Extra dependency; still not compiled |

## Decision

Plain `tsc` with project references. Everything that runs code (prod, dev, spawned-process tests) runs `dist/`. Vitest runs a package's own source and other packages' `dist/`. Relative imports keep `.ts`; `rewriteRelativeImportExtensions` writes `.js` in the output. The recipe:

### `tsconfig.json` (every package and app)

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // Editor, lint and typecheck only; the build uses tsconfig.build.json (see PITFALLS.md: Packages and apps compile to dist)
    "noEmit": true,
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "*.ts"]
}
```

### `tsconfig.build.json` (every package and app)

```jsonc
{
  // Compiles src/ (minus tests) to dist/. `tsc -b` builds the referenced packages first.
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "composite": true,
    "declarationMap": true,
    "rootDir": "src",
    "outDir": "dist",
    // Inside dist/, so deleting dist/ forces a rebuild (see PITFALLS.md: Stale dist)
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"],
  "references": []
}
```

`references` has one entry per workspace package in `dependencies`, e.g. `{ "path": "../../packages/db/tsconfig.build.json" }`.

### `package.json` scripts

Packages:

```json
"build": "tsc -b tsconfig.build.json",
"lint": "tsc -b tsconfig.build.json && eslint .",
"typecheck": "tsc -b tsconfig.build.json && tsc --noEmit",
"test": "tsc -b tsconfig.build.json && vitest run"
```

Apps add:

```json
"dev": "tsc -b tsconfig.build.json && concurrently --kill-others --names tsc,app \"tsc -b -w --preserveWatchOutput tsconfig.build.json\" \"node --watch --env-file-if-exists=../../.env dist/main.js\"",
"start": "node dist/main.js"
```

`start` never builds and never reads `.env`.

### `exports`

Point at `./dist/…/index.js` for each entry. No `types`, `main` or `files` fields.

### Adding a workspace dependency

1. `pnpm --filter <consumer> add "@gw/<pkg>@workspace:*"`
2. Add `{ "path": "../../packages/<pkg>/tsconfig.build.json" }` to the consumer's `tsconfig.build.json` `references`.

Skip step 2 and `tsc -b` won't build the dependency first.

## Consequences

- Every script starts with `tsc -b`, which rebuilds only what changed (under a second when nothing did). A fresh clone runs `pnpm install && pnpm test`.
- `tsc` never deletes files: a removed source file leaves a stale `.js` until `dist/` is deleted (see PITFALLS.md: Stale dist). Build info lives inside `dist/` so deleting `dist/` forces a rebuild.
- `references` must mirror `dependencies` (see PITFALLS.md: Workspace dependency needs a tsconfig reference).
- Exception: `tools/board-bot` keeps running `.ts` directly (standalone, never deployed).
- CI runs `pnpm build` once after install (see PITFALLS.md: CI builds everything first).
- Deploy: build stage runs `pnpm --filter <app> build` and `pnpm --filter <app> deploy --prod /out`; the runtime image runs `node dist/main.js` without `tsc`.
