COMPOSE := docker compose

.PHONY: dev rebuild up down logs ps build restart clean install lint typecheck login check-token test test-integration

## login: mint an INFISICAL_TOKEN from .env.bootstrap creds. Use: eval "$$(make login)"
##   (prints the export line so it lands in your shell; relies on .env.bootstrap)
login:
	@test -f .env.bootstrap || { echo "missing .env.bootstrap (cp .env.bootstrap.example)" >&2; exit 1; }
	@set -a; . ./.env.bootstrap; set +a; \
	echo "export INFISICAL_API_URL=$$INFISICAL_API_URL"; \
	echo "export INFISICAL_PROJECT_ID=$$(grep -o '\"workspaceId\"[^,]*' .infisical.json | sed -E 's/.*: *\"([^\"]+)\".*/\1/')"; \
	echo "export INFISICAL_TOKEN=$$(infisical login --method=universal-auth --client-id=$$INFISICAL_CLIENT_ID --client-secret=$$INFISICAL_CLIENT_SECRET --plain --silent)"

## check-token: fail fast if the Infisical token/URL aren't exported
check-token:
	@test -n "$$INFISICAL_TOKEN" || { echo "INFISICAL_TOKEN unset — run: eval \"\$$(make login)\"" >&2; exit 1; }
	@test -n "$$INFISICAL_API_URL" || { echo "INFISICAL_API_URL unset — run: eval \"\$$(make login)\"" >&2; exit 1; }

## dev: build images (if needed) and start the full stack in the foreground
dev: check-token
	$(COMPOSE) up --build

## rebuild: like dev, but also renew the node_modules anon volume.
##   Use after adding/removing a dependency — plain `dev` reuses the stale
##   node_modules volume and won't pick up new packages.
rebuild: check-token
	$(COMPOSE) up --build -V

## up: start the stack detached
up: check-token
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

## test: run unit tests (no Infisical/secrets needed)
test:
	npm test

## test-integration: run full suite + coverage with Infisical secrets injected
test-integration: check-token
	@test -n "$$INFISICAL_PROJECT_ID" || { echo "INFISICAL_PROJECT_ID unset — run: eval \"\$$(make login)\"" >&2; exit 1; }
	npm run test:integration
