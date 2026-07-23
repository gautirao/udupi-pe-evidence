#!/usr/bin/env bash
# dev-worktree-stack.sh — start a frontend+backend dev stack for ONE worktree,
# with the three port knobs forced into agreement and every assumption verified.
#
#   scripts/dev-worktree-stack.sh --worktree <path> --frontend-port <n> --backend-port <n>
#
# WHY THIS EXISTS
# ---------------
# Three knobs must move together and nothing in the repo couples them:
#
#   1. CORS_ALLOWED_ORIGINS   — backend allowlist (default 5173,5174,3000 only)
#   2. VITE_API_BASE_URL      — what the APP calls (src/lib/api.ts, default :8085)
#   3. BACKEND_BASE_URL       — what PLAYWRIGHT calls (e2e/** only, never src/**)
#
# Move one and leave the others and the app silently keeps calling the old
# backend, which then 403s the new origin. The UI renders "No areas found",
# which is indistinguishable from an empty database. On issue #1953 this
# destroyed four whole-suite E2E arms and manufactured eleven false
# regressions before anyone noticed the app had never loaded data.
#
# Worse: a broken app makes negative assertions PASS ("shows an error state",
# "no overlay present", "empty state renders"), so the pass RATE goes UP. You
# cannot detect this by looking at results. It must be checked before the run.
#
# Every check below is fail-closed and exists because it caught something real.

set -euo pipefail

MAIN_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE=""; FE_PORT=""; BE_PORT=""; SKIP_BACKEND=false; KEEP_LOGS=false

die() { printf '\n\033[31mFAIL\033[0m  %s\n' "$*" >&2; exit 1; }
ok()  { printf '\033[32m  ok\033[0m  %s\n' "$*"; }
step(){ printf '\n\033[1m==> %s\033[0m\n' "$*"; }

usage() {
  cat <<'USAGE'
Usage:
  scripts/dev-worktree-stack.sh --worktree <path> --frontend-port <n> --backend-port <n> [options]

Options:
  --no-backend     Frontend only; assume a backend is already serving --backend-port.
  --keep-logs      Do not delete previous log files.
  -h, --help       This message.

Pick ports that no sibling session is using. The script refuses to start if
either port is occupied, and names the process holding it.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worktree)      WORKTREE="${2:-}"; shift 2 ;;
    --frontend-port) FE_PORT="${2:-}";  shift 2 ;;
    --backend-port)  BE_PORT="${2:-}";  shift 2 ;;
    --no-backend)    SKIP_BACKEND=true; shift ;;
    --keep-logs)     KEEP_LOGS=true;    shift ;;
    -h|--help)       usage; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

[[ -n "$WORKTREE" && -n "$FE_PORT" && -n "$BE_PORT" ]] || { usage; die "missing required argument"; }
[[ "$FE_PORT" =~ ^[0-9]+$ && "$BE_PORT" =~ ^[0-9]+$ ]] || die "ports must be numeric"
WORKTREE="$(cd "$WORKTREE" 2>/dev/null && pwd)" || die "worktree path does not exist"

FE_ORIGIN="http://localhost:${FE_PORT}"
BE_ORIGIN="http://localhost:${BE_PORT}"
LOG_DIR="${TMPDIR:-/tmp}/dev-worktree-stack"
mkdir -p "$LOG_DIR"
BE_LOG="$LOG_DIR/backend-${BE_PORT}.log"
FE_LOG="$LOG_DIR/frontend-${FE_PORT}.log"
PIDFILE="$LOG_DIR/stack-${FE_PORT}-${BE_PORT}.pids"
$KEEP_LOGS || rm -f "$BE_LOG" "$FE_LOG"

BE_PID=""; FE_PID=""
cleanup_on_failure() {
  local code=$?
  if [[ $code -ne 0 ]]; then
    [[ -n "$FE_PID" ]] && kill "$FE_PID" 2>/dev/null || true
    [[ -n "$BE_PID" ]] && kill "$BE_PID" 2>/dev/null || true
    printf '\n\033[31mStack not started.\033[0m Logs: %s %s\n' "$BE_LOG" "$FE_LOG" >&2
  fi
}
trap cleanup_on_failure EXIT

# ── 1. worktree identity ─────────────────────────────────────────────────────
step "Worktree"
[[ -e "$WORKTREE/.git" ]] || die "$WORKTREE is not a git worktree"
BRANCH="$(git -C "$WORKTREE" rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git -C "$WORKTREE" rev-parse --short HEAD)"
ok "$WORKTREE"
ok "branch $BRANCH @ $HEAD_SHA"

# node_modules must be a REAL directory. A symlinked node_modules makes Vite
# serve static assets through /@fs, which 403s — and an over-broad E2E auth
# assertion then reports it as an authentication regression.
if [[ -L "$WORKTREE/node_modules" ]]; then
  die "node_modules is a SYMLINK. Vite will serve assets via /@fs and 403.
      Run 'npm ci' inside the worktree instead of linking node_modules."
elif [[ ! -d "$WORKTREE/node_modules" ]]; then
  die "node_modules missing. Run 'npm ci' in $WORKTREE first."
fi
ok "node_modules is a real directory"

# ── 2. ports must be free ────────────────────────────────────────────────────
step "Port preflight"
# NB: `lsof` exits 1 when nothing holds the port — i.e. on the SUCCESS path.
# Piping it straight into awk under `set -o pipefail` makes the assignment below
# fail and `set -e` kills the script exactly when the port is FREE. Swallow the
# non-match with `|| true` INSIDE the pipeline.
port_holder() { { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; } | awk 'NR==2{print $2}'; }
for spec in "frontend:$FE_PORT" "backend:$BE_PORT"; do
  role="${spec%%:*}"; port="${spec##*:}"
  # NB: must be an `if`, not `a && b && continue`. Under `set -e` that idiom
  # exits the script whenever the chain evaluates false — which is EVERY
  # frontend iteration — so the loop died before checking a port that was free,
  # and died silently because no die() ran.
  if $SKIP_BACKEND && [[ "$role" == backend ]]; then continue; fi
  pid="$(port_holder "$port")"
  if [[ -n "$pid" ]]; then
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    die "$role port $port is held by PID $pid
      cwd: ${cwd:-unknown}
      Choose another port, or stop that process if it is yours.
      Never assume an occupied port is serving YOUR tree — that is the defect
      this script exists to prevent."
  fi
  ok "$role port $port is free"
done

# ── 3. env symlinks ──────────────────────────────────────────────────────────
# Symlinked, never copied: a copy drifts from main and can be committed by
# accident. Contents are never read or printed by this script.
step "Environment files"
link_env() {
  local rel="$1" src="$MAIN_REPO/$1" dst="$WORKTREE/$1"
  [[ -e "$src" ]] || { printf '  --  %s not present in main repo, skipping\n' "$rel"; return 0; }
  if [[ -L "$dst" ]]; then ok "$rel already linked"; return 0; fi
  [[ -e "$dst" ]] && { ok "$rel exists in worktree (left untouched)"; return 0; }
  if git -C "$WORKTREE" check-ignore -q "$rel"; then
    mkdir -p "$(dirname "$dst")"
    ln -s "$src" "$dst"
    ok "$rel -> main repo (symlink)"
  else
    die "$rel is NOT gitignored in this worktree. Refusing to create it —
      it could be staged and committed. Fix .gitignore first."
  fi
}
link_env ".env"
link_env ".env.e2e"
link_env "backend/.env"

# ── 4. the three knobs, set together ─────────────────────────────────────────
step "Port configuration"
export SERVER_PORT="$BE_PORT"
export CORS_ALLOWED_ORIGINS="${FE_ORIGIN},http://127.0.0.1:${FE_PORT}"
export VITE_API_BASE_URL="$BE_ORIGIN"   # what the APP calls
export BACKEND_BASE_URL="$BE_ORIGIN"    # what PLAYWRIGHT calls
ok "CORS_ALLOWED_ORIGINS = $CORS_ALLOWED_ORIGINS"
ok "VITE_API_BASE_URL    = $VITE_API_BASE_URL   (app)"
ok "BACKEND_BASE_URL     = $BACKEND_BASE_URL   (playwright)"

# ── 5. backend ───────────────────────────────────────────────────────────────
if ! $SKIP_BACKEND; then
  step "Backend"
  [[ -x "$MAIN_REPO/backend/run-local.sh" ]] || die "backend/run-local.sh not found or not executable"
  ( cd "$WORKTREE" && bash "$WORKTREE/backend/run-local.sh" >"$BE_LOG" 2>&1 ) &
  BE_PID=$!
  printf '  ..  starting (log: %s)\n' "$BE_LOG"
  for i in $(seq 1 120); do
    kill -0 "$BE_PID" 2>/dev/null || die "backend exited early. Last lines:
$(tail -20 "$BE_LOG")"
    curl -fsS -o /dev/null "$BE_ORIGIN/actuator/health" 2>/dev/null && break
    curl -sS -o /dev/null -w '%{http_code}' "$BE_ORIGIN/api/discover/cities/bangalore/areas" 2>/dev/null | grep -qE '^[24]' && break
    sleep 2
    [[ $i -eq 120 ]] && die "backend did not become reachable on $BE_PORT within 240s. Last lines:
$(tail -20 "$BE_LOG")"
  done
  ok "backend listening on $BE_PORT (pid $BE_PID)"
else
  step "Backend (skipped)"
  curl -sS -o /dev/null "$BE_ORIGIN" 2>/dev/null || die "--no-backend given but nothing is answering on $BE_PORT"
  ok "existing backend answering on $BE_PORT"
fi

# ── 6. frontend ──────────────────────────────────────────────────────────────
# cd into the worktree. Launching Vite from the main repo makes Tailwind scan
# the WRONG TREE — new utility classes silently vanish from the served CSS —
# and makes Vite serve the wrong source entirely.
step "Frontend"
( cd "$WORKTREE" && npx vite --port "$FE_PORT" --strictPort >"$FE_LOG" 2>&1 ) &
FE_PID=$!
for i in $(seq 1 60); do
  kill -0 "$FE_PID" 2>/dev/null || die "vite exited early. Last lines:
$(tail -20 "$FE_LOG")"
  curl -sS -o /dev/null "$FE_ORIGIN" 2>/dev/null && break
  sleep 1
  [[ $i -eq 60 ]] && die "vite did not answer on $FE_PORT within 60s. Last lines:
$(tail -20 "$FE_LOG")"
done
ok "vite listening on $FE_PORT (pid $FE_PID)"

# ── 7. PROVENANCE: is this Vite serving THIS worktree? ───────────────────────
# A status check is worthless here. A Vite serving a DIFFERENT tree returns
# 200 for any path — the SPA fallback — with content-type text/html. Ask for a
# module and require a JS content-type. Prefer a file that exists ONLY on this
# branch, so the check also fails when the right server serves the wrong ref.
step "Provenance"
PROBE="$(git -C "$WORKTREE" diff --name-only "$(git -C "$WORKTREE" merge-base HEAD main 2>/dev/null || echo HEAD)"...HEAD -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null | head -1)"
[[ -n "$PROBE" ]] || PROBE="src/main.tsx"
CT="$(curl -sS -o /dev/null -w '%{content_type}' "$FE_ORIGIN/$PROBE" 2>/dev/null || true)"
case "$CT" in
  *javascript*|*ecmascript*)
    ok "$PROBE served as a module ($CT)" ;;
  *html*)
    die "$FE_ORIGIN/$PROBE returned content-type '$CT' — the SPA fallback.
      This Vite is NOT serving $WORKTREE (or not this branch).
      Status would have been 200. Content-type is what distinguishes them." ;;
  *)
    die "unexpected content-type '$CT' for $PROBE — cannot confirm provenance" ;;
esac

# ── 8. CORS: does the BROWSER's origin actually work? ────────────────────────
# curl without an Origin header succeeds even when every browser request 403s.
# The preflight must carry the real origin, or it cannot fail.
step "CORS preflight"
API_PROBE="/api/discover/cities/bangalore/areas"
ACAO="$(curl -sS -X OPTIONS "$BE_ORIGIN$API_PROBE" \
  -H "Origin: $FE_ORIGIN" \
  -H 'Access-Control-Request-Method: GET' \
  -D - -o /dev/null 2>/dev/null | tr -d '\r' | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: //p' | head -1)"
[[ -n "$ACAO" ]] || die "preflight from $FE_ORIGIN returned NO Access-Control-Allow-Origin.
      The backend is not allowlisting this origin. Browser requests will 403
      and the UI will render 'No areas found' — which looks exactly like an
      empty database. Check CORS_ALLOWED_ORIGINS reached the backend process."
ok "preflight allows $ACAO"

# ── 9. FUNCTIONAL CANARY: do real payloads arrive? ───────────────────────────
# Env-var presence proves configuration, never reachability. Require BYTES,
# not a status code: 200 with an empty body is the failure being guarded
# against. Validated against a known-bad origin first, so a pass means
# something.
step "Functional canary"
BAD="$(curl -sS -o /dev/null -w '%{http_code}' "$BE_ORIGIN$API_PROBE" \
  -H 'Origin: http://localhost:1' -H 'Access-Control-Request-Method: GET' -X OPTIONS 2>/dev/null || true)"
if [[ "$BAD" == "200" || "$BAD" == "204" ]]; then
  printf '  \033[33m!!\033[0m  known-bad origin ALSO passed preflight (%s) — the backend\n' "$BAD"
  printf '      allowlist may be wide open. The CORS check above proves less than it appears.\n'
else
  ok "known-bad origin correctly rejected ($BAD) — the check can fail"
fi
BYTES="$(curl -sS "$BE_ORIGIN$API_PROBE" -H "Origin: $FE_ORIGIN" 2>/dev/null | wc -c | tr -d ' ')"
if [[ "${BYTES:-0}" -lt 200 ]]; then
  printf '  \033[33m!!\033[0m  %s returned only %s bytes with a browser Origin.\n' "$API_PROBE" "$BYTES"
  printf '      If this endpoint needs auth that is expected; if not, the app will render\n'
  printf '      empty states and every negative E2E assertion will PASS. Verify before trusting a run.\n'
else
  ok "real payload received (${BYTES} bytes)"
fi

# ── 10. done ─────────────────────────────────────────────────────────────────
printf '%s\n' "$BE_PID" "$FE_PID" > "$PIDFILE" 2>/dev/null || true
trap - EXIT
cat <<EOF

$(printf '\033[1mStack up\033[0m')
  worktree   $WORKTREE
  branch     $BRANCH @ $HEAD_SHA
  frontend   $FE_ORIGIN   (pid ${FE_PID}, log $FE_LOG)
  backend    $BE_ORIGIN   (pid ${BE_PID:-external}, log $BE_LOG)

Playwright and the app both point at $BE_ORIGIN. Run E2E from $WORKTREE so
the specs, the served source and the config all come from one tree.

Stop:  kill \$(cat $PIDFILE)

EOF

wait
