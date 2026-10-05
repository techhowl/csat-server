COMPOSE := docker compose

.PHONY: dev rebuild up down logs ps build restart clean install lint typecheck check-env test test-integration

## check-env: fail fast if the repo-root .env is missing
check-env:
	@test -f .env || { echo "missing .env — run: cp .env.example .env  (then fill in the values)" >&2; exit 1; }

## dev: build images (if needed) and start the full stack in the foreground
dev: check-env
	$(COMPOSE) up --build

## rebuild: like dev, but also renew the node_modules anon volume.
##   Use after adding/removing a dependency — plain `dev` reuses the stale
##   node_modules volume and won't pick up new packages.
rebuild: check-env
	$(COMPOSE) up --build -V

## up: start the stack detached
up: check-env
	$(COMPOSE) up --build -d

## down: stop and remove containers + network (keeps mongo volume)
down:
	$(COMPOSE) down

## down-v: stop and remove containers AND the mongo data volume
down-v:
	$(COMPOSE) down -v

## logs: tail logs from all services
logs:
	$(COMPOSE) logs -f

## ps: show running services
ps:
	$(COMPOSE) ps

## restart: restart all services
restart:
	$(COMPOSE) restart

## install: install workspace deps locally (for editor/IDE)
install:
	npm install

## lint: run eslint across the monorepo
lint:
	npm run lint

## typecheck: full TypeScript build (no emit issues -> clean)
typecheck:
	npm run build

## test: run unit tests (no .env/secrets needed)
test:
	npm test

## test-integration: run full suite + coverage with secrets from .env (uses the csat_test DB)
test-integration: check-env
	npm run test:integration
