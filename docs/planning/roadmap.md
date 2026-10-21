# Roadmap *(draft: to be finalised in the phases discussion)*

| Phase | Goal | Done when |
|---|---|---|
| **0. Foundations** | Repo, tooling, local infra, CI, fake provider | `pnpm test` and CI pass on an empty app; `pnpm infra:up` works |
| **1. Data and admin core** | Schema, dashboard auth, projects, encrypted provider keys, gateway key issuance | A user can sign up, add a provider key and get a gateway key (via API) |
| **2. Gateway hot path** | Key lookup, pass-through (one provider, streaming), rate limits, budget enforcement, Redis failure mode | A real SDK call works through the gateway and limits are enforced |
| **3. Cold path** | Queue, worker, cost calculation, pricing table, rollups, partial-usage logging | Every request has a log row with correct cost; rollups populate |
| **4. Dashboard** | Key management UI, spend over time, per-key breakdown | Owner can manage keys and see spend; a11y and visual tests pass |
| **5. Proof and hardening** | E2E suite, k6 load test, security pass, README numbers | p95 overhead published in README |
| **6. Deploy** | Mac mini via Cloudflare Tunnel, then AWS with infra-as-code | Live URL; AWS can be built and torn down by command |
| **7. Go backend** | Migrate backend to Go once TS v1 is stable: gateway, then worker, then admin API ([ADR 0002](../decisions/0002-backend-language.md)) | Same test suite passes; k6 comparison vs TS baseline published |

## Later (post-v1)

Budget alert emails, second provider, response caching, opt-in prompt logging, dedicated log store.
