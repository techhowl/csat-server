# Contributing to csat-server

New here? Read [Getting started](docs/guides/getting-started.md) first to get the
stack running, then [Conventions](docs/guides/conventions.md) for how we write
code. This file is the day-to-day workflow.

## Branch model

- **`main`** → production. **`dev`** → staging. Both are protected merge targets.
- Do feature work on a branch off the latest `dev` (or `main`):

  ```bash
  git switch dev && git pull
  git switch -c feat/short-description
  ```

## Before you open a PR

Run the same checks CI runs, so nothing red lands in the PR:

```bash
npm run format       # Prettier (write)
npm run lint         # ESLint
npm run build        # full TypeScript build = typecheck
npm run test         # Vitest unit tests
```

Integration tests (need MongoDB + secrets via Infisical):

```bash
npm run test:integration
```

## Commits

- Keep each commit focused on one logical change.
- Use conventional-style prefixes, matching the existing history:
  `feat:`, `fix:`, `ci:`, `style:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Documentation lives with the code

We do **docs-as-code** — update docs in the **same PR** as the change:

- Changed how something works → update the relevant file under [`docs/`](docs/).
- Made a significant/structural decision → add an
  [ADR](docs/adr/README.md) (copy the template, bump the number, update the index).
- Added or changed an HTTP endpoint → update its `@openapi` JSDoc (served at
  `/docs`); don't hand-write endpoint docs in Markdown.
- Added a service or package → add a `README.md` stub in it and link it from the
  [architecture overview](docs/architecture/overview.md).

A stale doc is treated as a bug.

## Pull requests

1. Push your branch and open a PR into `dev` (or `main`).
2. PRs run the full check suite (lint, typecheck, tests, gitleaks, semgrep) — see
   [Conventions → CI pipeline](docs/guides/conventions.md#ci-pipeline). PRs do
   **not** build images.
3. Get a review, keep the branch up to date with the target, then merge.
4. On merge: `dev` builds a staging image, `main` builds a prod image (pushed to
   GHCR).

## Secrets — never commit them

Secrets come from Infisical at boot, never from committed files. Don't add real
values to `.env*`; `.env.bootstrap` is gitignored and local-only. CI runs
**gitleaks** over full history and will fail on leaked secrets.
