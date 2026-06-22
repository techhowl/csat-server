# Conventions

How we keep the codebase consistent. When in doubt, match the surrounding code.

## Repository layout

npm workspaces monorepo. Two kinds of workspace:

- `packages/*` — shared libraries (`@csat/shared`, `@csat/http`). No process of
  their own; imported by services.
- `services/*` — independent long-running processes (`@csat/api`,
  `@csat/worker`, `@csat/scheduler`), each with its own `Dockerfile`.

TypeScript uses **project references** (composite builds): the root
`tsconfig.json` references every workspace, so `tsc --build` compiles them in
dependency order. There is no `--noEmit` typecheck — `tsc -b` is the typecheck.

See [Architecture overview](../architecture/overview.md) for what each workspace does.

## TypeScript & style

- **Language**: TypeScript 5.7, CommonJS modules, Node 20+ target.
- **Formatting**: Prettier — never hand-format. `npm run format` to write,
  `npm run format:check` in CI.
- **Linting**: ESLint 9 (flat config) + `typescript-eslint`. `npm run lint`,
  `npm run lint:fix`.
- **Imports between workspaces** use the package name (`@csat/shared`), never a
  deep relative path across workspace boundaries.
- **Logging**: `createLogger("<name>")` from `@csat/shared`; structured fields,
  no bare `console.log`.
- **Config**: import `config` from `@csat/shared`; don't read `process.env`
  directly in feature code.
- **Database**: import the `database` singleton — one connection per process.

## API layering

Routes → controllers → services → models, each calling only the layer below.
Full rules and the "adding an endpoint" recipe are in
[API layer](../architecture/api.md).

## Documentation

Docs-as-code: update the relevant doc in the **same PR** as the code change.

- API endpoints → `@openapi` JSDoc blocks (served at `/docs`), not Markdown.
- Significant decisions → an [ADR](../adr/README.md).
- Diagrams → [Mermaid](https://mermaid.js.org/) fenced blocks (render on GitHub,
  stay diff-able). No committed binary image exports.

## Git workflow

- **`main`** → production. **`dev`** → staging. Both are protected merge targets.
- Feature work happens on a branch, then a **pull request** into `dev` (or
  `main`). PRs run the full checks; merges trigger image builds.
- Keep commits focused; write meaningful messages (the history uses
  conventional-style prefixes like `feat:`, `ci:`, `style:`).
- See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the step-by-step.

## CI pipeline

Defined in [`.github/workflows/main.yml`](../../.github/workflows/main.yml)
(workflow name **"Static checks"**). Triggers: push to `main`/`dev`, PRs into
`main`/`dev`, and manual dispatch.

| Job                          | What it runs                                                             |
| ---------------------------- | ------------------------------------------------------------------------ |
| **ESLint + Prettier**        | `eslint .` + `prettier --check .`                                        |
| **TypeScript**               | `tsc -b` (composite build = typecheck)                                   |
| **Unit + Integration tests** | `npm run test:coverage` against an ephemeral `mongo:7` service container |
| **Gitleaks**                 | secret scan over full history                                            |
| **Semgrep**                  | SAST (`--config=auto --error`)                                           |
| **Docker build & push**      | per-service image (`api`/`worker`/`scheduler`) → GHCR                    |

The build-and-push job needs lint + typecheck + test to pass, and runs **only on
branch pushes** (merges into `dev`/`main`) or manual dispatch — never on PRs.
Tags: branch name + short SHA always, plus `:latest` on `main`. Merge into `dev`
→ staging image; merge into `main` → prod image.
