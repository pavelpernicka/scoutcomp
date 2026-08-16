.DEFAULT_GOAL := help

.PHONY: help dev start stop logs test build docker-dev

help: ## Zobrazí dostupné příkazy.
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36mm%-10s\033[0m %s\n", $$1, $$2}'

dev: ## Spustí vývojovou verzi s živou propagací změn.
	bash scripts/dev.sh

start: dev ## Alias pro `make dev`.

stop: ## Zastaví vývojovou aplikaci.
	docker compose down

logs: ## Zobrazí logy spuštěné aplikace.
	docker compose logs -f

build: ## Sestaví služby, které mají Docker build konfiguraci.
	docker compose build

docker-dev: ## Volitelně spustí vývojovou verzi v Dockeru.
	docker compose up

test: ## Spustí backendové i frontendové testy v kontejnerech.
	docker compose run --rm backend pytest -q tests
	docker compose run --rm frontend sh -c "npm install && npm test -- --run"
