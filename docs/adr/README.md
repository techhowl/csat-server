# Architecture Decision Records

An ADR captures **one significant decision** and the reasoning behind it: the
context, the options weighed, what we chose, and the consequences. A diagram
shows _what_ the system is; an ADR shows _why_ it's that way.

We use the **MADR** format (Markdown Any Decision Records) —
<https://github.com/adr/madr>.

## How to add one

1. Copy [`template.md`](template.md) to `NNNN-short-title.md`, using the next
   number in sequence (zero-padded, e.g. `0002-...`).
2. Fill it in. Start at status **Proposed**; flip to **Accepted** when the team
   agrees (or **Rejected** / **Superseded by [NNNN](...)** later).
3. Add a row to the index below.
4. Open it in the same PR as the change it justifies.

Write an ADR whenever a choice would make future-you ask "why did we do it this
way?" — a framework/library pick, a structural pattern, a tradeoff with real
alternatives. Don't ADR trivial or easily-reversed choices.

## Index

| #                                             | Title                                      | Status   |
| --------------------------------------------- | ------------------------------------------ | -------- |
| [0000](0000-record-architecture-decisions.md) | Record architecture decisions              | Accepted |
| [0001](0001-monorepo-npm-workspaces.md)       | Service-based monorepo with npm workspaces | Accepted |
