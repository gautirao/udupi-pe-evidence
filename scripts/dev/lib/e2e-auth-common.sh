#!/usr/bin/env bash
# scripts/dev/lib/e2e-auth-common.sh — shared helpers for issue #2236 Part B
# (E2E Supabase Auth project provisioning/verification).
#
# Sourced by:
#   - scripts/dev/provision-e2e-auth-identities.sh
#   - scripts/dev/verify-e2e-auth-project.sh
#   - scripts/dev/local-fixture-backend.sh (option2 path only)
#
# Not executable on its own — source it:  source ".../e2e-auth-common.sh"
#
# Every function here is a small, pure(ish) primitive. All three consumers
# import this ONE file rather than each carrying its own copy of ref
# extraction, normalisation, the production-collision guard, the
# issuer/browser coherence assert, .env.e2e.auth loading/validation, or the
# PATH-resolved HTTP entrypoint — divergent copies of a security guard are
# exactly the kind of drift a reviewer would (rightly) flag.

# ---------------------------------------------------------------------------
# Normalisation / ref extraction
# ---------------------------------------------------------------------------

# _e2e_auth_trim_lower <value>
# Trims leading/trailing whitespace and lowercases. Uses `tr` for the
# lowercasing rather than bash 4's `${v,,}` — macOS ships bash 3.2 as
# /bin/bash, which does not support that expansion.
_e2e_auth_trim_lower() {
  local v="${1:-}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v" | tr '[:upper:]' '[:lower:]'
}

# _e2e_auth_extract_ref <url-or-bare-ref>
# The project ref is the FIRST dot-separated label of the URL's hostname:
#   https://abc123.supabase.co/whatever -> abc123
# Also accepts input that is already a bare ref (no scheme, no dot) and
# returns it as-is, trimmed/lowercased. Empty input -> empty output.
_e2e_auth_extract_ref() {
  local input normalized host
  input="$(_e2e_auth_trim_lower "${1:-}")"
  [[ -z "$input" ]] && { printf ''; return 0; }

  normalized="${input#http://}"
  normalized="${normalized#https://}"
  host="${normalized%%/*}"

  printf '%s' "${host%%.*}"
}

# ---------------------------------------------------------------------------
# Production-collision guard + issuer/browser coherence assert
# ---------------------------------------------------------------------------

# _e2e_auth_collision_guard <e2e_ref_or_url> <prod_ref_or_url>
# Fails closed (rc 1) if either side is empty/unresolved, or if the two refs
# match after normalisation. The empty checks run BEFORE the equality check
# so two empty strings can never compare "equal" into a pass.
_e2e_auth_collision_guard() {
  local e2e_ref prod_ref
  e2e_ref="$(_e2e_auth_extract_ref "${1:-}")"
  prod_ref="$(_e2e_auth_extract_ref "${2:-}")"

  if [[ -z "$e2e_ref" ]]; then
    echo "ERROR: E2E_SUPABASE_PROJECT_REF is empty/unset — refusing to proceed." >&2
    return 1
  fi
  if [[ -z "$prod_ref" ]]; then
    echo "ERROR: production SUPABASE_PROJECT_REF could not be determined — refusing to proceed (cannot prove the E2E ref differs from production)." >&2
    return 1
  fi
  if [[ "$e2e_ref" == "$prod_ref" ]]; then
    echo "ERROR: E2E_SUPABASE_PROJECT_REF ('${e2e_ref}') matches the production SUPABASE_PROJECT_REF — refusing to run E2E auth provisioning/verification against what looks like the production Supabase project." >&2
    return 1
  fi
  return 0
}

# _e2e_auth_detect_production_ref [repo_root]
# Resolves production's SUPABASE_PROJECT_REF, in priority order:
#   1. SUPABASE_PROJECT_REF already in the caller's environment
#   2. apps/api/.env (single-line grep — never sourced wholesale)
#   3. .env            (single-line grep — never sourced wholesale)
# Grepping a single line (rather than sourcing the file) means this can
# never accidentally pull an unrelated secret into the caller's shell.
_e2e_auth_detect_production_ref() {
  local repo_root="${1:-.}" f val

  if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
    printf '%s' "$SUPABASE_PROJECT_REF"
    return 0
  fi

  for f in "${repo_root}/apps/api/.env" "${repo_root}/.env"; do
    if [[ -f "$f" ]]; then
      val="$(grep -m1 -E '^SUPABASE_PROJECT_REF=' "$f" 2>/dev/null | cut -d'=' -f2- || true)"
      val="${val%\"}"; val="${val#\"}"
      val="${val%\'}"; val="${val#\'}"
      if [[ -n "$val" ]]; then
        printf '%s' "$val"
        return 0
      fi
    fi
  done

  printf ''
  return 0
}

# _e2e_auth_coherence_assert <ref_or_url_a> <ref_or_url_b> [context-label]
# The two inputs must extract to the SAME ref. A mismatch here otherwise
# presents downstream as a blanket 401 with no obvious cause (browser signs
# in against one project, backend validates against another).
_e2e_auth_coherence_assert() {
  local a b label
  a="$(_e2e_auth_extract_ref "${1:-}")"
  b="$(_e2e_auth_extract_ref "${2:-}")"
  label="${3:-ref coherence}"
  if [[ -z "$a" || -z "$b" || "$a" != "$b" ]]; then
    echo "ERROR: ${label} mismatch: '${a}' != '${b}' — this presents downstream as a blanket 401 with no obvious cause; fix the ref/URL pair before continuing." >&2
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Secret masking
# ---------------------------------------------------------------------------

# _e2e_auth_mask <value>
# Never prints the value itself — only whether it's empty, and its length.
# Use this anywhere a key-ish value could conceivably surface in output.
_e2e_auth_mask() {
  local v="${1:-}"
  if [[ -z "$v" ]]; then
    printf '(empty)'
  else
    printf '***REDACTED*** (%d chars)' "${#v}"
  fi
}

# ---------------------------------------------------------------------------
# .env.e2e.auth loading / validation
# ---------------------------------------------------------------------------

_E2E_AUTH_REQUIRED_KEYS=(
  E2E_SUPABASE_PROJECT_REF
  E2E_SUPABASE_URL
  E2E_SUPABASE_ANON_KEY
  E2E_ADMIN_EMAIL
  E2E_ADMIN_PASSWORD
  E2E_BROKER_EMAIL
  E2E_BROKER_PASSWORD
  E2E_USER_EMAIL
  E2E_USER_PASSWORD
  E2E_DEALER_EMAIL
  E2E_DEALER_PASSWORD
)

# _e2e_auth_file_mode <path>
# Portable octal permission bits (last 3 digits), macOS/BSD stat vs GNU stat.
# Empty output if stat is unavailable or the path doesn't exist.
_e2e_auth_file_mode() {
  local path="$1" raw
  if raw="$(stat -f '%Lp' "$path" 2>/dev/null)"; then
    printf '%s' "$raw"
  elif raw="$(stat -c '%a' "$path" 2>/dev/null)"; then
    printf '%s' "$raw"
  else
    printf ''
  fi
}

# _e2e_auth_load_and_validate <path-to-.env.e2e.auth>
# Fail-closed with a message containing the literal token
# E2E_AUTH_PROJECT_NOT_CONFIGURED (naming missing keys where applicable) if:
#   - the file does not exist
#   - the file's permission mode is not exactly 600 (world/group-readable
#     credential file is a finding, not a warning)
#   - any required key is missing or empty
# On success, exports the required keys into the caller's environment and
# returns 0.
_e2e_auth_load_and_validate() {
  local file="$1" mode missing=() key

  if [[ ! -f "$file" ]]; then
    echo "ERROR: E2E_AUTH_PROJECT_NOT_CONFIGURED: ${file} not found." >&2
    return 1
  fi

  mode="$(_e2e_auth_file_mode "$file")"
  if [[ "$mode" != "600" ]]; then
    echo "ERROR: E2E_AUTH_PROJECT_NOT_CONFIGURED: ${file} has mode ${mode:-unknown}, expected 600 — a world/group-readable credential file is treated as a fail-closed finding, not a warning. Fix with: chmod 600 ${file}" >&2
    return 1
  fi

  set -a
  # shellcheck source=/dev/null
  source "$file"
  set +a

  for key in "${_E2E_AUTH_REQUIRED_KEYS[@]}"; do
    if [[ -z "${!key:-}" ]]; then
      missing+=("$key")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: E2E_AUTH_PROJECT_NOT_CONFIGURED: ${file} is missing/empty required keys: ${missing[*]}" >&2
    return 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# HTTP entrypoint — PATH-resolved, so a test harness's mock curl intercepts
# every call made through it. No consumer of this file should invoke `curl`
# directly; route through this function (or a thin per-script wrapper that
# itself calls this function, e.g. provision's _admin_api_call()).
# ---------------------------------------------------------------------------

# _e2e_auth_curl_wrapper <curl-args...>
# `command curl` performs a fresh PATH lookup at call time (bypassing shell
# functions/aliases only, NOT PATH) — this is what lets a test harness that
# PATH-prepends a mock `curl` intercept every call.
_e2e_auth_curl_wrapper() {
  command curl "$@"
}

# _e2e_auth_curl_config_escape <value>
# Escapes a value for safe embedding inside a double-quoted curl --config
# string (curl recognizes \\, \", \t, \n, \r, \v as escapes there). Order
# matters: backslash MUST be escaped first, otherwise the backslashes
# introduced by the later substitutions (quote/CR/LF) would themselves get
# doubled ("double-unescaped") by a subsequent \\ pass.
_e2e_auth_curl_config_escape() {
  local s="${1:-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}
