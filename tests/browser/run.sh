#!/usr/bin/env bash
# Run the existing browser contract against our own local production server.
set -euo pipefail
cd "$(dirname "$0")/../.."
port="${TEMPER_TEST_PORT:-3000}"
log="$(mktemp)"
node web/node_modules/next/dist/bin/next start web --hostname 127.0.0.1 --port "$port" >"$log" 2>&1 &
server_pid=$!
cleanup() {
  result=$?
  trap - EXIT
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  if [ "$result" -ne 0 ]; then cat "$log"; fi
  rm -f "$log"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export TEMPER_TEST_URL="http://127.0.0.1:$port"
ready=false
for ((attempt=0; attempt<30; attempt++)); do
  kill -0 "$server_pid" 2>/dev/null || { cat "$log"; exit 1; }
  if curl --fail --silent --max-time 1 "$TEMPER_TEST_URL/license/" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true || { echo 'Local web server did not become ready' >&2; exit 1; }
node tests/browser/playground.mjs
