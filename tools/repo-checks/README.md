# @gw/repo-checks

- **Layer:** Tool (repo-wide guardrail tests)
- **May import:** Node built-ins, `eslint`, `typescript-eslint`, `vitest`
- **Does not:** import any `@gw/*` package

Tests that guard the rules in [code-structure.md](../../docs/architecture/code-structure.md), not product code.

- `src/boundaries.test.ts`: lints made-up files; each rule has a bad import that must fail, plus "allowed" cases. Add a case for every new rule.
- `src/pitfalls-pointers.test.ts`: every `PITFALLS.md: <heading>` pointer must name a real heading in `PITFALLS.md`.
- `fixtures/`: a deliberate import cycle, ignored by the normal lint.

Run: `pnpm --filter @gw/repo-checks test`. CI runs it on every PR.
