COMPOSE := docker compose

.PHONY: dev up down logs ps build restart clean install lint typecheck

## dev: build images (if needed) and start the full stack in the foreground
dev:
	$(COMPOSE) up --build

## up: start the stack detached
up:
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
