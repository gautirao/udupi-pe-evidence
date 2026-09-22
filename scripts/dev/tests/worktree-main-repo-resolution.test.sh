#!/usr/bin/env bash
# scripts/dev/tests/worktree-main-repo-resolution.test.sh — #2551
#
# Minimal, dependency-free bash assertion harness (same style as
# scripts/dev/tests/remote-db-safety.test.sh) covering:
#   - scripts/dev/lib/repo-resolution.sh (resolve_main_repo as a pure function)
#   - scripts/dev-worktree-stack.sh actually USING it, so that
#         <main-repo>/scripts/dev-worktree-stack.sh --worktree <wt> ...
#         <worktree>/scripts/dev-worktree-stack.sh  --worktree <wt> ...
#     provision identically.
#
# METHODOLOGY
# -----------
# Every case builds a DISPOSABLE git repository plus a linked worktree under
# mktemp -d. This suite never reads, writes, or even looks at the real repo's
# worktrees. No server, no network, no Maven, no npm.
#
# The end-to-end cases run the REAL scripts/dev-worktree-stack.sh with
# --no-backend. The script is EXPECTED to exit non-zero at the backend step
# (nothing is listening on the chosen port, by design — we start no servers).
# That happens AFTER env provisioning, which is the behaviour under test, so
# these cases assert on the emitted output and the resulting on-disk state,
# never on the exit code. Cases that assert the script must FAIL do check the
# exit code, and are reached before any port is touched.
#
# S-CONTROL is a mutation control: it restores the old path-derived resolution
# in a throwaway copy of the library and asserts the suite's central assertion
# then FAILS. Without it, S2 passing would prove nothing about whether S2 can
# fail.
#
# Run:  bash scripts/dev/tests/worktree-main-repo-resolution.test.sh
# Exits 0 if all assertions pass, non-zero otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
STACK_SCRIPT="$REPO_ROOT/scripts/dev-worktree-stack.sh"

TOTAL=0
FAILED=0

ok() { TOTAL=$((TOTAL + 1)); echo "ok $TOTAL - $1"; }
not_ok() { TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1)); echo "not ok $TOTAL - $1"; }
assert_true() { if [[ "$2" -eq 0 ]]; then ok "$1"; else not_ok "$1 (expected exit 0, got $2)"; fi; }
assert_false() { if [[ "$2" -ne 0 ]]; then ok "$1"; else not_ok "$1 (expected non-zero exit)"; fi; }
assert_eq() { if [[ "$2" == "$3" ]]; then ok "$1"; else not_ok "$1 (expected [$3], got [$2])"; fi; }
assert_ne() { if [[ "$2" != "$3" ]]; then ok "$1"; else not_ok "$1 (unexpectedly equal to [$3])"; fi; }
assert_contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else not_ok "$1 (expected to find [$3] in: $2)"; fi; }
assert_not_contains() { if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3])"; fi; }

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

# ===========================================================================
# Fixture builders
# ===========================================================================

# make_fixture <label-suffix> -> prints "<main>|<worktree>"
# Builds a primary checkout containing real copies of the script under test and
# its libraries, plus a linked worktree ready to be provisioned.
make_fixture() {
  local suffix="${1:-}"
  local tmp main wt
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/wt2551.XXXXXX")"
  CLEANUP_DIRS+=("$tmp")
  # PHYSICAL path. On macOS mktemp hands back /var/... while /var is a symlink
  # to /private/var, and both the library and the script under test normalise
  # with `pwd -P`. Comparing a logical fixture path against a physical result
  # would fail every assertion for a reason that has nothing to do with #2551.
  tmp="$(cd "$tmp" && pwd -P)"
  main="$tmp/primary${suffix}"
  wt="$tmp/linked${suffix}"

  mkdir -p "$main/scripts/dev/lib" "$main/apps/web" "$main/apps/api"
  cp "$STACK_SCRIPT" "$main/scripts/"
  cp "$REPO_ROOT/scripts/dev/lib/port-ownership.sh"  "$main/scripts/dev/lib/"
  cp "$REPO_ROOT/scripts/dev/lib/repo-resolution.sh" "$main/scripts/dev/lib/"
  chmod +x "$main/scripts/dev-worktree-stack.sh"
  printf '.env*\nnode_modules/\n' > "$main/.gitignore"

  git -C "$main" init -q -b main
  git -C "$main" config user.email test@example.invalid
  git -C "$main" config user.name  "test"
  git -C "$main" add -A
  git -C "$main" commit -qm "fixture"
  git -C "$main" worktree add -q "$wt" -b feature

  # Vite refuses a symlinked node_modules; the script enforces a real dir.
  mkdir -p "$wt/node_modules" "$wt/apps/web" "$wt/apps/api"
  printf '%s|%s\n' "$main" "$wt"
}

# seed_shared_env <main> — the secrets that live ONLY in the primary checkout.
seed_shared_env() {
  printf 'MARKER=FROM_PRIMARY_CHECKOUT\n' > "$1/.env"
  printf 'MARKER=FROM_PRIMARY_CHECKOUT\n' > "$1/.env.e2e"
}

# Two free ports, probed so concurrent runs in other worktrees never collide.
# shellcheck source=../lib/port-ownership.sh
source "$REPO_ROOT/scripts/dev/lib/port-ownership.sh"

# run_stack <script-path> <cwd> <worktree-arg> -> prints combined output
# Exit code is deliberately discarded here (see METHODOLOGY).
run_stack() {
  local script="$1" cwd="$2" wt_arg="$3"
  local fe be
  fe="$(find_free_port 45300)"
  be="$(find_free_port $((fe + 1)))"
  ( cd "$cwd" && bash "$script" --worktree "$wt_arg" \
      --frontend-port "$fe" --backend-port "$be" --no-backend 2>&1 ) || true
}

# Classify a path: SYMLINK-><target> | REALFILE | ABSENT
classify() {
  if [[ -L "$1" ]]; then printf 'SYMLINK->%s\n' "$(readlink "$1")"
  elif [[ -f "$1" ]]; then printf 'REALFILE\n'
  else printf 'ABSENT\n'; fi
}

# ===========================================================================
# T-LIB — resolve_main_repo() as a pure function.
# ===========================================================================

# shellcheck source=../lib/repo-resolution.sh
source "$REPO_ROOT/scripts/dev/lib/repo-resolution.sh"

IFS='|' read -r LMAIN LWT <<< "$(make_fixture "")"

# L1: the primary checkout resolves to itself.
OUT="$(resolve_main_repo "$LMAIN" 2>&1)"; RC=$?
assert_true "L1: primary checkout resolves (exit 0)" "$RC"
assert_eq   "L1: primary checkout resolves to itself" "$OUT" "$(cd "$LMAIN" && pwd -P)"

# L2: THE REGRESSION — a linked worktree resolves to the PRIMARY checkout.
OUT="$(resolve_main_repo "$LWT" 2>&1)"; RC=$?
assert_true "L2: linked worktree resolves (exit 0)" "$RC"
assert_eq   "L2: linked worktree resolves to the PRIMARY checkout" "$OUT" "$(cd "$LMAIN" && pwd -P)"
assert_ne   "L2: linked worktree does NOT resolve to itself" "$OUT" "$(cd "$LWT" && pwd -P)"

# L3: a subdirectory inside the worktree resolves the same way.
OUT="$(resolve_main_repo "$LWT/apps/web" 2>&1)"; RC=$?
assert_true "L3: subdirectory inside a worktree resolves (exit 0)" "$RC"
assert_eq   "L3: subdirectory resolves to the PRIMARY checkout" "$OUT" "$(cd "$LMAIN" && pwd -P)"

# L4: a RELATIVE reference path.
OUT="$( cd "$LWT/.." && resolve_main_repo "./$(basename "$LWT")" 2>&1 )"; RC=$?
assert_true "L4: relative reference path resolves (exit 0)" "$RC"
assert_eq   "L4: relative reference path resolves to the PRIMARY checkout" "$OUT" "$(cd "$LMAIN" && pwd -P)"

# L5: paths containing SPACES.
IFS='|' read -r SMAIN SWT <<< "$(make_fixture " with spaces")"
OUT="$(resolve_main_repo "$SWT" 2>&1)"; RC=$?
assert_true "L5: worktree path with spaces resolves (exit 0)" "$RC"
assert_eq   "L5: worktree path with spaces resolves to the PRIMARY checkout" "$OUT" "$(cd "$SMAIN" && pwd -P)"

# L6: a path outside any git repository FAILS LOUDLY.
NONGIT="$(mktemp -d "${TMPDIR:-/tmp}/wt2551ng.XXXXXX")"; CLEANUP_DIRS+=("$NONGIT")
OUT="$(resolve_main_repo "$NONGIT" 2>&1)"; RC=$?
assert_false    "L6: a non-repo path fails closed" "$RC"
assert_contains "L6: refusal says it is not inside a git repository" "$OUT" "not inside a git repository"

# L7: a BARE repository FAILS LOUDLY — no working tree means no shared checkout.
BARE="$(mktemp -d "${TMPDIR:-/tmp}/wt2551bare.XXXXXX")"; CLEANUP_DIRS+=("$BARE")
git init -q --bare "$BARE/repo.git"
OUT="$(resolve_main_repo "$BARE/repo.git" 2>&1)"; RC=$?
assert_false    "L7: a bare repository fails closed" "$RC"
assert_contains "L7: refusal names the bare repository" "$OUT" "BARE repository"

# L8: a non-existent directory fails closed.
OUT="$(resolve_main_repo "$NONGIT/definitely-not-here" 2>&1)"; RC=$?
assert_false    "L8: a non-existent path fails closed" "$RC"
assert_contains "L8: refusal says the directory does not exist" "$OUT" "not an existing directory"

# L9: no argument at all fails closed.
OUT="$(resolve_main_repo 2>&1)"; RC=$?
assert_false    "L9: a missing reference path fails closed" "$RC"
assert_contains "L9: refusal asks for a reference path" "$OUT" "reference path is required"

# L10: the recorded main working tree has been MOVED AWAY — never silently
# substitute something plausible.
IFS='|' read -r MMAIN MWT <<< "$(make_fixture "-moved")"
mv "$MMAIN" "${MMAIN}-relocated"
# stdout ONLY: on the success path resolve_main_repo prints the resolved path
# there and nothing else. Diagnostics go to stderr and legitimately mention the
# reference path, so folding 2>&1 in would make this assertion untestable.
OUT="$(resolve_main_repo "$MWT" 2>/dev/null)"; RC=$?
assert_false "L10: a moved-away main checkout fails closed" "$RC"
assert_eq    "L10: it prints no resolved path at all (no silent fallback)" "$OUT" ""

# ===========================================================================
# T-SCRIPT — the real dev-worktree-stack.sh, both invocation paths.
# ===========================================================================

IFS='|' read -r EMAIN EWT <<< "$(make_fixture "-e2e")"
seed_shared_env "$EMAIN"

# S1: invoked from the PRIMARY checkout's copy.
rm -f "$EWT/.env" "$EWT/.env.e2e" "$EWT/.env.e2e.local"
OUT_MAIN="$(run_stack "$EMAIN/scripts/dev-worktree-stack.sh" "$EMAIN" "$EWT")"
S1_ENV="$(classify "$EWT/.env")"
S1_E2E="$(classify "$EWT/.env.e2e")"
S1_LOCAL="$(classify "$EWT/.env.e2e.local")"
assert_eq "S1: .env symlinked to the PRIMARY checkout" "$S1_ENV" "SYMLINK->$EMAIN/.env"
assert_eq "S1: .env.e2e symlinked to the PRIMARY checkout" "$S1_E2E" "SYMLINK->$EMAIN/.env.e2e"
assert_eq "S1: .env.e2e.local is a REAL per-worktree file" "$S1_LOCAL" "REALFILE"

# S2: THE REGRESSION — invoked from the WORKTREE's own copy of the script.
rm -f "$EWT/.env" "$EWT/.env.e2e" "$EWT/.env.e2e.local"
OUT_WT="$(run_stack "$EWT/scripts/dev-worktree-stack.sh" "$EWT" "$EWT")"
S2_ENV="$(classify "$EWT/.env")"
S2_E2E="$(classify "$EWT/.env.e2e")"
S2_LOCAL="$(classify "$EWT/.env.e2e.local")"
assert_eq "S2: .env symlinked to the PRIMARY checkout (not the worktree)" "$S2_ENV" "SYMLINK->$EMAIN/.env"
assert_eq "S2: .env.e2e symlinked to the PRIMARY checkout" "$S2_E2E" "SYMLINK->$EMAIN/.env.e2e"
# Match the rendered line, not a bare substring: ".env not present" is also a
# substring of the legitimate "apps/web/.env not present" line, so the loose
# form would fire on a file that really is absent and prove nothing.
assert_not_contains "S2: never claims a present shared file is absent" "$OUT_WT" "--  .env not present"
assert_contains "S2: reports the resolved shared checkout" "$OUT_WT" "main repo $EMAIN"

# S3: the two invocations are EQUIVALENT — this is the acceptance criterion.
assert_eq "S3: .env provisioning identical across both invocations" "$S2_ENV" "$S1_ENV"
assert_eq "S3: .env.e2e provisioning identical across both invocations" "$S2_E2E" "$S1_E2E"
assert_eq "S3: .env.e2e.local provisioning identical across both invocations" "$S2_LOCAL" "$S1_LOCAL"

# S4: .env.e2e.local must stay a REAL file carrying THIS worktree's ports.
# Turning it into a shared symlink would silently destroy per-worktree port
# isolation (#2078), so assert both halves explicitly.
if [[ -f "$EWT/.env.e2e.local" && ! -L "$EWT/.env.e2e.local" ]]; then
  ok "S4: .env.e2e.local is a real file and NOT a symlink"
else
  not_ok "S4: .env.e2e.local is a real file and NOT a symlink"
fi
LOCAL_BODY="$(cat "$EWT/.env.e2e.local" 2>/dev/null)"
assert_contains "S4: .env.e2e.local carries PLAYWRIGHT_BASE_URL" "$LOCAL_BODY" "PLAYWRIGHT_BASE_URL=http://localhost:"
assert_contains "S4: .env.e2e.local carries BACKEND_BASE_URL"    "$LOCAL_BODY" "BACKEND_BASE_URL=http://localhost:"

# S5: a RELATIVE --worktree argument, from the worktree's own script copy.
rm -f "$EWT/.env" "$EWT/.env.e2e" "$EWT/.env.e2e.local"
OUT_REL="$(run_stack "$EWT/scripts/dev-worktree-stack.sh" "$(dirname "$EWT")" "./$(basename "$EWT")")"
assert_eq "S5: relative --worktree still symlinks to the PRIMARY checkout" \
  "$(classify "$EWT/.env")" "SYMLINK->$EMAIN/.env"
assert_contains "S5: relative --worktree resolves the shared checkout" "$OUT_REL" "main repo $EMAIN"

# S6: a MISSING shared env file is reported against the RESOLVED checkout, and
# nothing is fabricated in the worktree.
assert_contains "S6: skip message names the checkout that was searched" "$OUT_WT" "apps/web/.env not present in $EMAIN"
assert_eq "S6: a genuinely missing shared file is not created" "$(classify "$EWT/apps/web/.env")" "ABSENT"

# S7: --worktree pointing at a plain directory (not a git worktree) FAILS.
PLAIN="$(mktemp -d "${TMPDIR:-/tmp}/wt2551plain.XXXXXX")"; CLEANUP_DIRS+=("$PLAIN")
( cd "$EMAIN" && bash "$EMAIN/scripts/dev-worktree-stack.sh" --worktree "$PLAIN" \
    --frontend-port 45999 --backend-port 45998 --no-backend ) >/dev/null 2>&1
assert_false "S7: a non-worktree --worktree target fails closed" "$?"

# S8: paths with SPACES, end to end, from the worktree's own copy.
IFS='|' read -r XMAIN XWT <<< "$(make_fixture " e2e spaces")"
seed_shared_env "$XMAIN"
OUT_SP="$(run_stack "$XWT/scripts/dev-worktree-stack.sh" "$XWT" "$XWT")"
assert_eq "S8: spaces in paths still symlink to the PRIMARY checkout" \
  "$(classify "$XWT/.env")" "SYMLINK->$XMAIN/.env"
assert_eq "S8: spaces in paths keep .env.e2e.local a real file" \
  "$(classify "$XWT/.env.e2e.local")" "REALFILE"

# S9: running the stack FOR the primary checkout itself never self-links.
IFS='|' read -r PMAIN _PWT <<< "$(make_fixture "-selfhost")"
seed_shared_env "$PMAIN"
mkdir -p "$PMAIN/node_modules"
OUT_SELF="$(run_stack "$PMAIN/scripts/dev-worktree-stack.sh" "$PMAIN" "$PMAIN")"
assert_eq "S9: the main checkout's own .env is left a real file, not self-linked" \
  "$(classify "$PMAIN/.env")" "REALFILE"
assert_contains "S9: reports that the target IS the main checkout" "$OUT_SELF" "nothing to link"

# ===========================================================================
# S-CONTROL — mutation control. Restore the OLD path-derived resolution in a
# throwaway copy of the library and prove S2's assertion FAILS, i.e. that the
# assertion is capable of detecting the defect it claims to guard.
# ===========================================================================

IFS='|' read -r CMAIN CWT <<< "$(make_fixture "-control")"
seed_shared_env "$CMAIN"
cat > "$CWT/scripts/dev/lib/repo-resolution.sh" <<'MUTATION'
# Mutation: the pre-#2551 behaviour — derive the main repo from where the
# script file happens to live, which in a worktree is the worktree itself.
resolve_git_common_dir() { printf '%s\n' "unused"; }
resolve_main_repo() { (cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd); }
MUTATION
rm -f "$CWT/.env" "$CWT/.env.e2e" "$CWT/.env.e2e.local"
OUT_CTRL="$(run_stack "$CWT/scripts/dev-worktree-stack.sh" "$CWT" "$CWT")"
CTRL_ENV="$(classify "$CWT/.env")"
assert_ne "S-CONTROL: with the old resolution, .env is NOT linked to the primary checkout" \
  "$CTRL_ENV" "SYMLINK->$CMAIN/.env"
assert_eq "S-CONTROL: with the old resolution, .env is left ABSENT (the #2551 defect)" \
  "$CTRL_ENV" "ABSENT"
assert_not_contains "S-CONTROL: with the old resolution, the PRIMARY checkout is never identified" \
  "$OUT_CTRL" "main repo $CMAIN"
assert_contains "S-CONTROL: with the old resolution, the worktree is mistaken for the main repo" \
  "$OUT_CTRL" "main repo $CWT"

# ===========================================================================
echo
echo "1..$TOTAL"
if [[ "$FAILED" -gt 0 ]]; then
  echo "FAILED: $FAILED of $TOTAL assertions" >&2
  exit 1
fi
echo "All $TOTAL assertions passed."
