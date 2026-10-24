# 0011. Project ownership: single owner now, teams later

- **Status:** Accepted
- **Date:** 2026-10-23
- **Task:** GW-012

## Context

v1 has one user per project. If this becomes a product, teams will be needed: several users sharing projects and keys, with roles. Phase 1 doesn't need teams, but the schema shouldn't make them hard to add.

Common SaaS shape (e.g. OpenAI, Vercel): team → projects → keys. Keys belong to the project, not a person, so they keep working when someone leaves.

## Options

| | **(a) `owner_id` now, teams later** | **(b) `project_members` now** | **(c) Teams now** |
|---|---|---|---|
| Phase 1 tables | `projects.owner_id` | `project_members` (user, project, role) | Better Auth organization plugin: organizations, members, invitations; `projects.team_id` |
| "Can user X see project Y?" | `owner_id = X` | X has a row for Y | X is a member of Y's team |
| Roles | One: owner | Per project | Per team: owner, admin, member (built in) |
| Adding a teammate | Not possible | Add to each project, one by one | Invite once; sees all team projects |
| Phase 1 effort | Smallest | +1 table, role checks | +1–2 tasks: plugin setup, personal team at signup (custom code), active team |
| Moving to teams later | One migration (below) | Awkward: no "team" to invite into; ends up rebuilt as (c) | Nothing to do |
| Risk | Small, if access is checked in one place | Builds the wrong shape | Scope creep in a sprint that doesn't need it |

## Decision

(a): `projects.owner_id` now. All project access goes through one function, `canAccessProject(userId, projectId)`; no query checks `owner_id` on its own.

## Consequences

- Teams are listed under "Later" in the [roadmap](../planning/roadmap.md).
- The single access check is what keeps the move cheap: only that function changes, its callers don't.

### Moving to teams: schema changes

| Table | Now | With teams |
|---|---|---|
| `projects` | `owner_id` → users | `team_id` → teams |
| `gateway_keys` | no change | + `created_by` → users (who issued the key) |
| `provider_keys` | no change | no change |
| `auth.sessions` | no change | + `active_organization_id` (team being worked in) |
| New | none | organizations, members, invitations (Better Auth plugin) |

### Moving to teams: steps

1. Enable Better Auth's organization plugin; generate its tables and migration.
2. Create a one-person team for every existing user, with that user as `owner`.
3. Add `projects.team_id`; fill it from each project's `owner_id`; make it `NOT NULL`.
4. Change `canAccessProject` from "is the owner" to "is a member of the project's team".
5. Add `gateway_keys.created_by` (nullable for existing keys).
6. Drop `projects.owner_id` once nothing reads it.
7. Add signup logic that creates a personal team (the plugin doesn't do this itself, as of 2026-10-23).

Steps 2–3 run in one migration inside a transaction, so no project is ever without an owner.

### Open product questions for then

- Who pays and who sets budgets: the team owner, or per project?
- When a member leaves, do the keys they created stay active? (Default: yes; show `created_by` so an admin can revoke.)
- Can a user belong to several teams? (The plugin allows it; the dashboard needs a team switcher.)
