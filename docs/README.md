# csat-server documentation

Internal documentation for the CSAT backend. These are plain Markdown files
committed to the repo — GitHub renders them (including Mermaid diagrams) in the
web UI, so this folder _is_ the docs site. No build step, no hosting.

The root [README](../README.md) is the front door (quick start + secrets). This
folder goes deeper: how the system fits together, how to work in it, and why it
is the way it is.

## Contents

### Architecture

- [Overview](architecture/overview.md) — the services and packages, how a
  request flows, and the shared MongoDB connection (with diagram).
- [API layer](architecture/api.md) — how `@csat/api` is layered
  (routes → controllers → services → models) and where the live OpenAPI docs are.

### Guides

- [Getting started](guides/getting-started.md) — clone → secrets → run → test.
- [Conventions](guides/conventions.md) — folder layout, naming, lint/format,
  branch/commit/PR flow, and the CI pipeline.

### Decisions

- [Architecture Decision Records](adr/README.md) — the _why_ behind significant
  choices. Add one whenever you make a decision that future-you would ask "why?"

## Maintaining these docs

Docs-as-code: docs live next to the code and change in the **same pull request**
as the code they describe. If a PR changes how something works, update the
relevant doc in that PR. Treat a stale doc as a bug.

- New significant decision → add an [ADR](adr/README.md).
- New service or package → add a `README.md` stub in it and link it from
  [the overview](architecture/overview.md).
- Diagrams → use [Mermaid](https://mermaid.js.org/) fenced code blocks so they
  render on GitHub and stay diff-able. Don't commit binary image exports.
