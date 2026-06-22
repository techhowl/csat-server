# 0000. Record architecture decisions

- Status: Accepted
- Date: 2026-06-22
- Deciders: csat-server team

## Context and problem statement

As the codebase grows, the reasoning behind structural choices (why a framework,
why a pattern, why a tradeoff) gets lost. Code shows _what_ we did; it rarely
shows _why_, or which alternatives we rejected. New contributors then re-litigate
settled decisions or break invariants they didn't know existed. How do we keep
that reasoning durable and reviewable?

## Considered options

- **ADRs in the repo (Markdown).** Decisions live as files next to the code,
  reviewed in PRs, versioned with the code.
- **A wiki / external doc tool.** Lives outside the repo, drifts from the code,
  needs separate access.
- **Nothing formal.** Rely on commit messages, chat history, and memory.

## Decision

We chose **ADRs in the repo**, using the MADR Markdown format
(<https://github.com/adr/madr>), stored in `docs/adr/`.

Because: they're free and zero-infra (GitHub renders Markdown), they're reviewed
in the same PR as the change, they stay private with the repo, and they're
diff-able and searchable. The cost — writing a short file per decision — is small
relative to the cost of lost context.

## Consequences

- Good: durable "why" for significant decisions; onboarding reads `docs/adr/` to
  understand the shape of the system; settled debates stop recurring.
- Cost: discipline — an ADR only helps if we actually write one when it matters,
  and keep the [index](README.md) current.
- Follow-up: add ADRs going forward; backfill the most load-bearing past
  decisions (this file + [0001](0001-monorepo-npm-workspaces.md) are the start).
