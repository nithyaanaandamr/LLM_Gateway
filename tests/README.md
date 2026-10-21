# Cross-app tests

| Folder | Tool | Covers |
|---|---|---|
| `e2e/` | Playwright | User flows, visual regression, accessibility (axe) |
| `load/` | k6 | Gateway overhead at p95 vs direct-to-provider |

Unit and integration tests live next to the code in each app. See [testing strategy](../docs/quality/testing-strategy.md).
