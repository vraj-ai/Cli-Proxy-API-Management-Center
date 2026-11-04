#!/usr/bin/env bash
# verify-management-center helper. Usage:
#   mc.sh launch    build dist/ and start the fixture backend (scripts/fleet-fixture.ts) on $MC_PORT
#   mc.sh doctor    read-only health check of the instance this helper started
#   mc.sh drive <feature> [args]   run scripts/drive.mjs <feature>; evidence -> $MC_EVIDENCE/<run>/
#   mc.sh cleanup   stop the fixture we started (by recorded PID); evidence is kept
set -uo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(git -C "$SKILL_DIR" rev-parse --show-toplevel)"
PORT="${MC_PORT:-4173}"
STATE="${MC_STATE:-/tmp/mc-verify-$PORT}"           # scratch: pid + log (removed by cleanup)
EVIDENCE="${MC_EVIDENCE:-$ROOT/.verify}"            # proof artifacts (survive cleanup, gitignored)
TOOLS="${MC_TOOLS:-$HOME/.cache/mc-verify-tools}"   # playwright-core install, outside the repo
KEY="fixture-management-key"                        # public fixture key hard-coded in scripts/fleet-fixture.ts
die() { echo "mc.sh: $*" >&2; exit 2; }
cd "$ROOT" || die "cannot cd $ROOT"

case "${1:-}" in
launch)
  [ -f "$STATE/pid" ] && kill -0 "$(cat "$STATE/pid")" 2>/dev/null && die "already running (pid $(cat "$STATE/pid")); run cleanup first"
  ss -ltn "sport = :$PORT" | grep -q LISTEN && die "port $PORT is busy and not ours; set MC_PORT"
  mkdir -p "$STATE"
  [ -d node_modules ] || bun install --frozen-lockfile || die "bun install failed"
  bun run build > "$STATE/build.log" 2>&1 || { tail -20 "$STATE/build.log"; die "build failed"; }
  [ -d "$TOOLS/node_modules/playwright-core" ] || { mkdir -p "$TOOLS" && (cd "$TOOLS" && bun add playwright-core@1.56 >/dev/null) || die "playwright-core install failed"; }
  FLEET_FIXTURE_PORT="$PORT" setsid bun scripts/fleet-fixture.ts > "$STATE/fixture.log" 2>&1 &
  echo $! > "$STATE/pid"
  for _ in $(seq 50); do grep -q "Fleet fixture ready" "$STATE/fixture.log" && break; sleep 0.2; done
  grep -q "Fleet fixture ready" "$STATE/fixture.log" || { cat "$STATE/fixture.log"; die "fixture did not become ready"; }
  echo "ready: http://127.0.0.1:$PORT  pid $(cat "$STATE/pid")  log $STATE/fixture.log"
  ;;
doctor)
  ok=0
  pid="$(cat "$STATE/pid" 2>/dev/null)" || { echo "FAIL no pid file at $STATE/pid (not launched by mc.sh)"; exit 1; }
  kill -0 "$pid" 2>/dev/null && echo "ok   fixture pid $pid alive" || { echo "FAIL pid $pid dead"; ok=1; }
  owner="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
  opg="$(ps -o pgid= -p "${owner:-0}" 2>/dev/null | tr -d ' ')"
  [ -n "$owner" ] && { [ "$owner" = "$pid" ] || [ "$opg" = "$pid" ]; } && echo "ok   port $PORT owned by our process group ($owner)" || { echo "FAIL port $PORT owner '$owner' != $pid"; ok=1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/management.html")"
  [ "$code" = 200 ] && echo "ok   UI served (management.html 200)" || { echo "FAIL UI http $code (build dist/?)"; ok=1; }
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/v0/management/config")" = 401 ] && echo "ok   management API rejects missing key" || { echo "FAIL auth gate"; ok=1; }
  curl -sf -H "Authorization: Bearer $KEY" "http://127.0.0.1:$PORT/v0/management/fleet/state" >/dev/null && echo "ok   fixture key accepted, Fleet present" || { echo "FAIL fleet/state with fixture key (absent mode?)"; ok=1; }
  [ dist/index.html -nt src ] && echo "ok   dist/index.html newer than src/ ($(git rev-parse --short HEAD))" || echo "warn dist/ may be stale vs src/; re-run launch after cleanup"
  exit $ok
  ;;
drive)
  shift; [ -n "${1:-}" ] || die "usage: mc.sh drive <feature>"
  RUN="${MC_RUN:-$(date +%Y%m%d-%H%M%S)-$1}"; OUT="$EVIDENCE/$RUN"; mkdir -p "$OUT"
  NODE_PATH="$TOOLS/node_modules" MC_URL="http://127.0.0.1:$PORT" MC_KEY="$KEY" MC_OUT="$OUT" \
    node "$SKILL_DIR/scripts/drive.mjs" "$@" 2>&1 | tee "$OUT/drive.log"
  rc=${PIPESTATUS[0]}; echo "evidence: $OUT (exit $rc)"; exit $rc
  ;;
cleanup)
  if [ -f "$STATE/pid" ]; then
    pid="$(cat "$STATE/pid")"; kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
    for _ in $(seq 25); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    kill -0 "$pid" 2>/dev/null && { kill -9 "$pid"; }
    echo "stopped fixture pid $pid"
  else echo "nothing to stop (no $STATE/pid)"; fi
  rm -rf "$STATE"
  echo "evidence kept under $EVIDENCE"
  ;;
*) sed -n 2,6p "$0"; exit 2 ;;
esac
