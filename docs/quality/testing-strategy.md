# Testing strategy

## Layers

| Layer | Tool | Where | Runs |
|---|---|---|---|
| Lint (incl. a11y rules) | ESLint + `eslint-plugin-jsx-a11y` | All | Every PR |
| Unit | Vitest | Next to code | Every PR |
| Component a11y | Vitest + `vitest-axe` | `apps/dashboard` | Every PR |
| Integration | Vitest + Testcontainers (real Postgres, Redis) + fake provider | Each app | Every PR |
| E2E | Playwright | `tests/e2e` | Every PR |
| Visual regression | Playwright `toHaveScreenshot()` | `tests/e2e` | Every PR |
| Page a11y | Playwright + `@axe-core/playwright` | `tests/e2e` | Every PR |
| Page audit | Lighthouse CI | Dashboard | Every PR |
| Load | k6 | `tests/load` | Manual / before release |
| Manual a11y | Checklist below | Dashboard | Each release |

## Rules

- Tests never call real providers.
- Visual baselines are generated and compared inside the same Docker image (see PITFALLS.md: visual tests).
- Must-test edge cases: concurrent requests near the budget cap, client disconnect mid-stream, Redis down (both modes), revoked key still in cache.

## Accessibility target

**WCAG 2.2 AA.**

Manual checklist per release:
- [ ] Every action works with keyboard only; focus is always visible
- [ ] VoiceOver reads each page in a sensible order
- [ ] Colour contrast passes (text and chart colours)
- [ ] Every chart has a text summary and a table view
- [ ] Works at 200% zoom and 320px width
