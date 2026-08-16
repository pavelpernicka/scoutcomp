#!/usr/bin/env bash
# Local development launcher.  It intentionally does not require Docker.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_dir="$root_dir/backend"
frontend_dir="$root_dir/frontend"
venv_dir="$backend_dir/.venv"

ensure_backend() {
  if [[ ! -x "$venv_dir/bin/python" ]]; then
    echo "Vytvářím Python virtualenv…"
    python3 -m venv "$venv_dir"
  fi
  local checksum saved=""
  checksum="$(sha256sum "$backend_dir/requirements.txt" | awk '{print $1}')"
  [[ -f "$venv_dir/.requirements-checksum" ]] && read -r saved < "$venv_dir/.requirements-checksum"
  if [[ "$checksum" != "$saved" ]]; then
    echo "Instaluji backendové závislosti…"
    "$venv_dir/bin/pip" install -r "$backend_dir/requirements.txt"
    printf '%s\n' "$checksum" > "$venv_dir/.requirements-checksum"
  fi
}

ensure_frontend() {
  local checksum saved=""
  checksum="$(sha256sum "$frontend_dir/package-lock.json" | awk '{print $1}')"
  # Docker used to create root-owned Vite cache files.  Renaming the whole
  # directory is atomic, does not need access to its children and lets npm
  # build a clean local dependency tree.
  if [[ -d "$frontend_dir/node_modules" ]] && find "$frontend_dir/node_modules" -xdev ! -user "$(id -u)" -print -quit | grep -q .; then
    echo "Odděluji staré Dockerem vytvořené node_modules…"
    mv "$frontend_dir/node_modules" "$frontend_dir/.node_modules-legacy-$(date +%s)"
  fi
  [[ -f "$frontend_dir/node_modules/.scoutcomp-lock" ]] && read -r saved < "$frontend_dir/node_modules/.scoutcomp-lock"
  if [[ ! -d "$frontend_dir/node_modules" || "$checksum" != "$saved" ]]; then
    echo "Instaluji frontendové závislosti…"
    (cd "$frontend_dir" && npm ci)
    printf '%s\n' "$checksum" > "$frontend_dir/node_modules/.scoutcomp-lock"
  fi
}

ensure_backend
ensure_frontend

cleanup() {
  trap - INT TERM EXIT
  kill "${backend_pid:-}" "${site_pid:-}" "${frontend_pid:-}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "ScoutComp dev běží: http://localhost:5173 (API: http://localhost:8001, veřejný web: http://localhost:8090)"
(cd "$backend_dir" && exec "$venv_dir/bin/uvicorn" app.main:app --reload --port 8001) &
backend_pid=$!

backend_ready=false
for _ in {1..30}; do
  if "$venv_dir/bin/python" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/healthz', timeout=1)" >/dev/null 2>&1; then
    backend_ready=true
    break
  fi
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    echo "Backend se nepodařilo spustit." >&2
    exit 1
  fi
  sleep 1
done
if [[ "$backend_ready" != true ]]; then
  echo "Backend neprošel kontrolou zdraví do 30 sekund." >&2
  exit 1
fi

(cd "$backend_dir" && exec "$venv_dir/bin/uvicorn" app.site_app:app --reload --port 8090) &
site_pid=$!
(cd "$frontend_dir" && exec npm run dev -- --host 0.0.0.0 --port 5173) &
frontend_pid=$!
wait "$backend_pid" "$site_pid" "$frontend_pid"
