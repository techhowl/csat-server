# LLM Context — Change Log

## 2026-06-30 — CI failure fixes

**Files changed:** `eslint.config.mjs`, `services/api/src/utils/jwt.ts`, `tests/unit/shared/config.test.ts`, `.github/workflows/main.yml`

| Fix                                      | File                | Change                                                                                                                            |
| ---------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ESLint dist false-positives              | `eslint.config.mjs` | Added bare `"dist"` to `ignores` alongside `**/dist/**`                                                                           |
| Semgrep `jwt-exposed-data` (blocking)    | `jwt.ts`            | Replaced `jwt.sign(payload, ...)` → `jwt.sign({ userId: payload.userId }, ...)` in both `signAccessToken` and `signRefreshToken`  |
| Unit tests throwing on `PASSWORD_PEPPER` | `config.test.ts`    | Added `PASSWORD_PEPPER` to `CONFIG_VARS`, `REQUIRED_ENV`, fixed existing JWT test, added new `PASSWORD_PEPPER` required test case |
| Integration test missing secrets         | `main.yml`          | Added `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PASSWORD_PEPPER` to CI `env:` block via `secrets.CI_*`                          |

**Test results after fix:** 28 passed, 1 skipped (integration — expected without live Mongo locally), 0 failed.
**Lint result:** 0 errors, 1 warning (pre-existing `console.log` in `api/src/index.ts`).

**Action still required from user:** Add 3 GitHub Actions secrets (`CI_JWT_ACCESS_SECRET`, `CI_JWT_REFRESH_SECRET`, `CI_PASSWORD_PEPPER`) in GitHub repo Settings → Secrets → Actions.

---

**Files changed:** `.infisical.json`, `docker-compose.yml`

**What changed:**

- Old project/workspace ID `614c0077-6657-4956-bcdb-be85c86131c8` was returning 404 (project deleted or recreated in Infisical).
- `e85f3cbf-0186-4bc6-be1b-1a5696288da3` is the **org** ID, not a project ID — using it returned a "not found during bot lookup" 404. The real project ID is `1132a6a9-384e-46be-89f2-695627f7bf39`.
- Updated `workspaceId` in `.infisical.json` → `1132a6a9-384e-46be-89f2-695627f7bf39`
- Updated `INFISICAL_PROJECT_ID` in all three services in `docker-compose.yml` and in `services/api/Dockerfile` → `1132a6a9-384e-46be-89f2-695627f7bf39`

---

## 2026-06-30 — .env.example rewrite

**File changed:** `.env.example`

**What changed:**

- Rewrote `.env.example` from scratch after analysing the entire codebase.
- Added all env vars read in `packages/shared/src/config.ts` (the single config source of truth).
- Grouped variables into logical sections: Runtime, Database, API Server, Auth/JWT, Security, Worker, Scheduler, Logging.
- Marked every variable as REQUIRED or OPTIONAL with its default value.
- Added generation commands (`openssl rand -base64 48/32`) for secrets.
- Added sensible example values for optional vars so a developer can copy the file without manual research.

**Variables documented:**

| Variable                     | Required | Default                       |
| ---------------------------- | -------- | ----------------------------- |
| `NODE_ENV`                   | No       | `development`                 |
| `MONGO_URI`                  | **Yes**  | —                             |
| `MONGO_DB_NAME`              | No       | `csat`                        |
| `API_PORT`                   | No       | `4000`                        |
| `JWT_ACCESS_SECRET`          | **Yes**  | —                             |
| `JWT_REFRESH_SECRET`         | **Yes**  | —                             |
| `JWT_ACCESS_TTL`             | No       | `15m`                         |
| `JWT_REFRESH_TTL`            | No       | `30d`                         |
| `PASSWORD_PEPPER`            | **Yes**  | —                             |
| `WORKER_POLL_INTERVAL_MS`    | No       | `5000`                        |
| `SCHEDULER_TICK_INTERVAL_MS` | No       | `10000`                       |
| `LOG_LEVEL`                  | No       | `info` (prod) / `debug` (dev) |
