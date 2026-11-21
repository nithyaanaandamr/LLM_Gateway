# @gw/dashboard

- **Layer:** App (React UI, planned)
- **May import:** `@gw/shared` main entry only
- **Does not:** import `@gw/db`, `@gw/auth`, `@gw/shared/crypto`, `node:*` or other apps

React + TypeScript (Vite). Talks only to `admin-api`.

**Screens (v1):** login, projects, provider key, gateway keys, spend over time, per-key breakdown.

**Libraries:** TanStack Query (server data), Recharts (charts).

**Quality bar:** WCAG 2.2 AA. Charts have a text summary and table view. See [testing strategy](../../docs/quality/testing-strategy.md).
