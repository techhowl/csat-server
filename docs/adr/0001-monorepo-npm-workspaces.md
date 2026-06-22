# 0001. Service-based monorepo with npm workspaces

- Status: Accepted
- Date: 2026-06-22
- Deciders: csat-server team

## Context and problem statement

The CSAT backend is several cooperating processes — an HTTP `api`, a background
`worker`, and a `scheduler` — that share config, logging, a database connection,
and HTTP helpers. How should we organise the code so shared logic isn't
duplicated, the services stay independently deployable, and the toolchain stays
simple for a small team?

## Considered options

- **Single monorepo, npm workspaces** — `packages/*` for shared libs,
  `services/*` for processes, TypeScript project references for builds.
- **Multiple repos** (one per service + published shared packages) — strong
  isolation, but versioning/publishing overhead and cross-repo changes are painful.
- **One service, one process** — fold worker/scheduler into the api. Simplest
  now, but couples unrelated workloads and blocks independent scaling/deploys.
- **Heavier monorepo tooling** (Nx, Turborepo) — more features, more moving parts
  than this size of project needs.

## Decision

We chose a **single monorepo using npm workspaces**, with shared code in
`packages/` (`@csat/shared`, `@csat/http`) and deployable processes in
`services/` (`@csat/api`, `@csat/worker`, `@csat/scheduler`), wired together with
TypeScript composite **project references**.

Because: shared code is imported by package name with no publishing step; an
atomic PR can change a shared package and all its consumers together; each
service still builds into its own Docker image and deploys independently; and
plain npm workspaces + `tsc --build` keep the toolchain minimal — no extra
monorepo framework to learn or maintain.

## Consequences

- Good: zero-overhead code sharing; atomic cross-cutting changes; independent
  per-service images and deploys; one `npm install`, one lint/format/test config.
- Cost: a change to `@csat/shared` can ripple across all services (mitigated by
  CI building everything via `tsc -b`); a single repo means coarser-grained
  access control than separate repos.
- Implications: builds use `tsc -b` (composite references), not `--noEmit`; cross-
  workspace imports use the package name, never deep relative paths. See
  [Conventions](../guides/conventions.md).
