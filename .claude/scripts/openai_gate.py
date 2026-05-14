"""
openai_gate.py — Secure OpenAI gate automation CLI.

Submits route-and-run gate packets to the OpenAI API and returns a strict
machine-parseable verdict. Secret handling is env-var-only; no key is ever
written to disk, logs, stdout, or stderr in any code path.

Usage:
    python -m .claude.scripts.openai_gate \\
        --issue 1078 \\
        --gate PLAN_REVIEW \\
        --input .claude/handoffs/issue-1078/002-plan-review-request.toml \\
        [--model gpt-4o-2024-08-06] \\
        [--dry-run] \\
        [--max-attempts 1] \\
        [--max-input-bytes 65536] \\
        [--max-output-tokens 4000] \\
        [--timeout-seconds 60]

Exit codes:
    0 — success (see verdict.json for result)
    2 — OPENAI_API_KEY not set (non-dry-run)
    3 — malformed/invalid response from API
    4 — input file not found
    5 — input file exceeds max-input-bytes
    6 — input file contains likely secret
    7 — network timeout
    8 — API error (auth/quota/5xx)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

# ── Typed exceptions ──────────────────────────────────────────────────────────

class OpenAIGateError(Exception):
    """Base class for gate errors."""


class MissingKeyError(OpenAIGateError):
    """OPENAI_API_KEY is not set."""


class InputFileNotFoundError(OpenAIGateError):
    """Input file does not exist."""


class InputTooLargeError(OpenAIGateError):
    """Input file exceeds max-input-bytes limit."""


class SecretInInputError(OpenAIGateError):
    """Input file contains a likely secret."""
    def __init__(self, pattern_name: str, line_number: int) -> None:
        self.pattern_name = pattern_name
        self.line_number = line_number
        super().__init__(
            f"Input contains likely secret (pattern: {pattern_name}, line: {line_number}); aborting"
        )


class OpenAIShapeError(OpenAIGateError):
    """SDK call failed — sanitized, no key/headers included."""


class NetworkTimeoutError(OpenAIGateError):
    """Network timeout — sanitized."""


class MalformedResponseError(OpenAIGateError):
    """Response is not valid JSON or does not match schema."""
    def __init__(self, message: str, raw_text: str | None = None) -> None:
        super().__init__(message)
        self.raw_text = raw_text or ""


# ── Secret scanner ────────────────────────────────────────────────────────────

# Pattern name → compiled regex.  Order matters for reporting.
_SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # OpenAI API keys anywhere in the text
    ("sk-key", re.compile(r"sk-[A-Za-z0-9]{20,}")),
    # Explicit OPENAI_API_KEY assignment
    ("openai-api-key-assignment", re.compile(r"OPENAI_API_KEY\s*=")),
    # HTTP Authorization Bearer header
    ("authorization-bearer", re.compile(r"Authorization\s*:\s*Bearer\s+\S+")),
    # PEM private key marker
    ("pem-private-key", re.compile(r"-----BEGIN\s+\S*\s*PRIVATE KEY-----")),
    # AWS IAM access key prefix
    ("aws-akia", re.compile(r"AKIA[0-9A-Z]{16}")),
    # Generic dotenv-style secret assignments for common names
    (
        "dotenv-secret-assignment",
        re.compile(
            r"^(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|PRIVATE_KEY|ACCESS_KEY)\s*=",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
]


def scan_for_secrets(text: str) -> None:
    """
    Scan *text* for likely secrets.  Raises SecretInInputError on first match
    with pattern name + line number only — matched content is never echoed.
    """
    lines = text.splitlines()
    for pattern_name, pattern in _SECRET_PATTERNS:
        for lineno, line in enumerate(lines, start=1):
            if pattern.search(line):
                raise SecretInInputError(pattern_name, lineno)


# ── Key redaction ─────────────────────────────────────────────────────────────

_REDACT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"(Authorization\s*:\s*Bearer\s+)\S+"),
    re.compile(r"(OPENAI_API_KEY\s*=\s*)\S+"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
]


def redact_secrets(text: str) -> str:
    """Replace known secret patterns with [REDACTED]."""
    result = text
    result = _REDACT_PATTERNS[0].sub("[REDACTED]", result)
    result = _REDACT_PATTERNS[1].sub(r"\1[REDACTED]", result)
    result = _REDACT_PATTERNS[2].sub(r"\1[REDACTED]", result)
    result = _REDACT_PATTERNS[3].sub("[REDACTED]", result)
    return result


# ── Verdict schema ────────────────────────────────────────────────────────────

VERDICT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "gate": {
            "type": "string",
            "enum": ["PLAN_REVIEW", "WORKDONE_REVIEW", "PR_REVIEW", "SCOPE_CHANGE_REVIEW"],
        },
        "issue": {"type": "integer"},
        "verdict": {"type": "string"},
        "summary": {"type": "string"},
        "blocking_issues": {"type": "array", "items": {"type": "string"}},
        "required_changes": {"type": "array", "items": {"type": "string"}},
        "approved_scope": {"type": ["array", "null"], "items": {"type": "string"}},
        "approved_files": {"type": ["array", "null"], "items": {"type": "string"}},
        "next_action": {"type": "string"},
    },
    "required": [
        "gate",
        "issue",
        "verdict",
        "summary",
        "blocking_issues",
        "required_changes",
        "next_action",
    ],
    "additionalProperties": False,
}

# Per-gate valid verdict enums (enforced AFTER schema parse)
PER_GATE_ENUMS: dict[str, list[str]] = {
    "PLAN_REVIEW": ["APPROVED", "REVISION_REQUIRED", "BLOCKED", "NEEDS_USER_DECISION", "NEEDS_MORE_EVIDENCE"],
    "WORKDONE_REVIEW": ["APPROVED_FOR_PR", "NEEDS_FIXES", "NEEDS_MORE_EVIDENCE", "NEEDS_USER_DECISION"],
    "PR_REVIEW": ["APPROVED_TO_MERGE", "NEEDS_FIXES", "NEEDS_MORE_EVIDENCE", "NEEDS_USER_DECISION"],
    "SCOPE_CHANGE_REVIEW": ["APPROVED", "REJECTED", "REVISION_REQUIRED", "NEEDS_MORE_EVIDENCE", "NEEDS_USER_DECISION"],
}

# ── Adapter ───────────────────────────────────────────────────────────────────


def call_openai_structured_verdict(
    packet: str,
    gate: str,
    schema: dict,
    *,
    model: str,
    max_output_tokens: int,
    timeout_seconds: int,
) -> tuple[dict, str | None]:
    """
    Spike-verified Responses API call (openai>=1.50,<2.0).

    Call shape:
        client.responses.create(
            model=model,
            input=prompt,
            text={"format": {"type": "json_schema", "name": "VerdictSchema",
                             "schema": schema, "strict": True}},
            max_output_tokens=max_output_tokens,
            timeout=timeout_seconds,
        )
        result = json.loads(response.output_text)

    Returns:
        Tuple of (parsed_dict, request_id). request_id is None if unavailable.
        parsed_dict is already JSON-decoded, pre-schema-validated by SDK.

    Raises:
        NetworkTimeoutError — on httpx.TimeoutException or openai.APITimeoutError.
        OpenAIShapeError    — on other API/SDK failures (message sanitized, no key).
        MalformedResponseError — if output_text is missing or not parseable JSON.
    """
    # Import inside function to allow test-file monkey-patching at module level.
    import openai  # noqa: PLC0415

    api_key = os.environ.get("OPENAI_API_KEY")
    # Key presence validated by caller before reaching here; guard anyway.
    if not api_key:
        raise MissingKeyError("OPENAI_API_KEY is not set")

    client = openai.OpenAI(api_key=api_key)

    prompt = (
        "You are a strict code-review gatekeeper. "
        "Return a JSON verdict matching the provided schema EXACTLY. "
        "Do not add commentary outside the JSON object.\n\n"
        f"Gate: {gate}\n\n"
        f"Packet:\n{packet}"
    )

    try:
        response = client.responses.create(
            model=model,
            input=prompt,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "VerdictSchema",
                    "schema": schema,
                    "strict": True,
                }
            },
            max_output_tokens=max_output_tokens,
            timeout=float(timeout_seconds),
        )
    except openai.APITimeoutError:
        raise NetworkTimeoutError(
            f"OpenAI request timed out after {timeout_seconds}s"
        ) from None
    except openai.APIConnectionError:
        raise NetworkTimeoutError("Network connection error reaching OpenAI") from None
    except openai.AuthenticationError:
        # Sanitized — do not include any repr of the error object (may contain config)
        raise OpenAIShapeError("OpenAI authentication failed (check OPENAI_API_KEY)") from None
    except openai.RateLimitError:
        raise OpenAIShapeError("OpenAI rate limit exceeded") from None
    except openai.APIStatusError as exc:
        # Sanitized — only status code and message type, no headers/request
        raise OpenAIShapeError(
            f"OpenAI API error: HTTP {exc.status_code}"
        ) from None
    except AttributeError:
        # SDK shape mismatch — sanitized, no exc repr to avoid leaking config state
        raise OpenAIShapeError("Unexpected SDK attribute shape — check openai SDK version") from None

    _raw_id = getattr(response, "id", None)
    request_id: str | None = str(_raw_id) if _raw_id is not None else None

    raw_text = getattr(response, "output_text", None)
    if raw_text is None:
        raise MalformedResponseError(
            "Response object has no output_text attribute", raw_text=""
        )

    try:
        return json.loads(raw_text), request_id
    except json.JSONDecodeError as exc:
        raise MalformedResponseError(
            f"Response is not valid JSON: {exc}", raw_text=raw_text
        ) from None


# ── Artifact storage ──────────────────────────────────────────────────────────

def _artifact_dir(issue: int, gate: str, ts: str) -> Path:
    return Path(".claude/openai-gates") / f"issue-{issue}" / f"{ts}-{gate}"


# ── Compact verdict helpers ───────────────────────────────────────────────────

# Exact set of fields written to verdict.json / verdict.toml.
MINIMAL_VERDICT_FIELDS: frozenset[str] = frozenset({
    "gate",
    "issue",
    "verdict",
    "model",
    "ts_start",
    "ts_end",
    "request_id",
    "confidence",
    "reasons_summary",
    "blocking_issue_count",
    "required_change_count",
    "blocking_issues_summary",
    "required_changes_summary",
})

# Character caps applied to AI-generated text before persistence.
REASONS_SUMMARY_MAX: int = 500
ITEM_SUMMARY_MAX: int = 200
MAX_LIST_ITEMS: int = 5

_TRUNCATION_MARKER: str = "... [truncated]"


def _toml_str_value(v: object) -> str:
    """
    Render a Python value as a TOML right-hand side literal.

    None is serialized as the empty string ``""`` because TOML 1.0 has no
    ``null`` keyword.  Consumers that need to distinguish "not set" from an
    empty string should check the companion JSON artifact (``verdict.json``),
    which uses real JSON ``null``.
    """
    if v is None:
        return '""'
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(v)
    if isinstance(v, list):
        items = ", ".join(_toml_str_value(i) for i in v)
        return f"[{items}]"
    # str — escape backslashes, double-quotes, and ASCII control characters
    # Backslash must be replaced first (before any escape sequence is introduced).
    escaped = (
        str(v)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
    return f'"{escaped}"'


def _truncate(text: str, cap: int) -> str:
    """
    Redact secrets from *text*, then clip to *cap* characters (marker-inclusive).

    Truncation policy: clip body to ``cap - len(marker)`` then append the marker.
    The total length is always <= cap.  If the text already fits within cap after
    redaction, it is returned as-is (no marker appended).
    """
    redacted = redact_secrets(text)
    if len(redacted) <= cap:
        return redacted
    body_cap = cap - len(_TRUNCATION_MARKER)
    return redacted[:body_cap] + _TRUNCATION_MARKER


def _compact_list(
    items: list[str],
    item_cap: int,
    max_count: int,
) -> list[str]:
    """
    Redact secrets in ALL items first, then clip to *max_count* entries.

    Redaction precedes slicing so that any future increase of *max_count* never
    exposes unredacted items.  Only the first *max_count* items are returned;
    the rest are discarded (not persisted).

    NOTE: the caller is responsible for recording ``len(items)`` as the count
    field — counts must reflect the TRUE total, not the truncated list length.
    """
    return [_truncate(item, item_cap) for item in items][:max_count]


def _minimal_verdict_record(
    verdict_dict: dict,
    *,
    model: str,
    ts_start: str,
    ts_end: str,
    request_id: str | None,
) -> dict:
    """
    Build the compact 13-field dict written to verdict.json / verdict.toml.

    This is called from the artifact-write layer only, AFTER _validate_verdict
    has enforced the full schema.  The full in-process verdict_dict is not
    modified — this function returns a new dict.

    confidence is always None (forward-compat placeholder; OpenAI Responses API
    does not supply confidence scores for text generations).
    """
    blocking_issues: list[str] = verdict_dict.get("blocking_issues") or []
    required_changes: list[str] = verdict_dict.get("required_changes") or []
    summary: str = verdict_dict.get("summary") or ""

    return {
        "gate": verdict_dict["gate"],
        "issue": verdict_dict["issue"],
        "verdict": verdict_dict["verdict"],
        "model": model,
        "ts_start": ts_start,
        "ts_end": ts_end,
        "request_id": request_id,
        "confidence": None,
        "reasons_summary": _truncate(summary, REASONS_SUMMARY_MAX),
        "blocking_issue_count": len(blocking_issues),
        "required_change_count": len(required_changes),
        "blocking_issues_summary": _compact_list(
            blocking_issues, ITEM_SUMMARY_MAX, MAX_LIST_ITEMS
        ),
        "required_changes_summary": _compact_list(
            required_changes, ITEM_SUMMARY_MAX, MAX_LIST_ITEMS
        ),
    }


def _write_artifacts(
    artifact_dir: Path,
    *,
    packet_path: Path,
    raw_text: str,
    verdict_dict: dict | None,
    error_dict: dict | None,
    model: str,
    gate: str,
    issue: int,
    ts_start: str,
    ts_end: str,
    request_id: str | None = None,
) -> None:
    """Write all durable artifacts for one run. Key-redact raw_text before writing."""
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # input-packet.toml — copy of input, run through redact_secrets as
    # defense-in-depth (scanner pre-flight is the primary guard).
    input_text = packet_path.read_text(encoding="utf-8")
    (artifact_dir / "input-packet.toml").write_text(
        redact_secrets(input_text), encoding="utf-8"
    )

    # raw-response.txt — key-redacted
    (artifact_dir / "raw-response.txt").write_text(
        redact_secrets(raw_text), encoding="utf-8"
    )

    if verdict_dict is not None:
        compact = _minimal_verdict_record(
            verdict_dict,
            model=model,
            ts_start=ts_start,
            ts_end=ts_end,
            request_id=request_id,
        )
        # verdict.json — compact allowlisted shape only
        (artifact_dir / "verdict.json").write_text(
            json.dumps(compact, indent=2), encoding="utf-8"
        )
        # verdict.toml — same compact shape in TOML (uses module-level _toml_str_value)
        toml_lines = [
            f'gate = {_toml_str_value(compact["gate"])}',
            f'issue = {_toml_str_value(compact["issue"])}',
            f'verdict = {_toml_str_value(compact["verdict"])}',
            f'model = {_toml_str_value(compact["model"])}',
            f'ts_start = {_toml_str_value(compact["ts_start"])}',
            f'ts_end = {_toml_str_value(compact["ts_end"])}',
            f'request_id = {_toml_str_value(compact["request_id"])}',
            f'confidence = {_toml_str_value(compact["confidence"])}',
            f'reasons_summary = {_toml_str_value(compact["reasons_summary"])}',
            f'blocking_issue_count = {_toml_str_value(compact["blocking_issue_count"])}',
            f'required_change_count = {_toml_str_value(compact["required_change_count"])}',
            f'blocking_issues_summary = {_toml_str_value(compact["blocking_issues_summary"])}',
            f'required_changes_summary = {_toml_str_value(compact["required_changes_summary"])}',
        ]
        (artifact_dir / "verdict.toml").write_text(
            "\n".join(toml_lines) + "\n", encoding="utf-8"
        )

        # transcript.md — NEVER include key/Bearer/Authorization
        transcript = textwrap.dedent(f"""\
            # Gate Run Transcript

            **Issue:** {issue}
            **Gate:** {gate}
            **Model:** {model}
            **Started:** {ts_start}
            **Finished:** {ts_end}
            **Verdict:** {verdict_dict['verdict']}

            ## Summary

            {verdict_dict['summary']}

            ## Blocking Issues

            {chr(10).join('- ' + b for b in verdict_dict['blocking_issues']) or '(none)'}

            ## Required Changes

            {chr(10).join('- ' + r for r in verdict_dict['required_changes']) or '(none)'}

            ## Next Action

            {verdict_dict['next_action']}
        """)
        (artifact_dir / "transcript.md").write_text(
            redact_secrets(transcript), encoding="utf-8"
        )

    if error_dict is not None:
        (artifact_dir / "error.json").write_text(
            json.dumps(error_dict, indent=2), encoding="utf-8"
        )

    # metadata.json — NO secrets: no key, no headers, no auth
    metadata = {
        "model": model,
        "gate": gate,
        "issue": issue,
        "ts_start": ts_start,
        "ts_end": ts_end,
        "artifact_dir": str(artifact_dir),
    }
    (artifact_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )


def _append_index(issue: int, gate: str, ts: str, verdict: str | None, error: str | None) -> None:
    index_path = Path(".claude/openai-gates") / "INDEX.md"
    index_path.parent.mkdir(parents=True, exist_ok=True)
    outcome = verdict if verdict else f"ERROR:{error}"
    line = f"| {ts} | {issue} | {gate} | {outcome} | issue-{issue}/{ts}-{gate}/ |\n"
    if not index_path.exists():
        header = (
            "# OpenAI Gate Run Index\n\n"
            "| Timestamp | Issue | Gate | Outcome | Artifacts |\n"
            "|-----------|-------|------|---------|----------|\n"
        )
        index_path.write_text(header + line, encoding="utf-8")
    else:
        with index_path.open("a", encoding="utf-8") as fh:
            fh.write(line)


# ── Approved-plan materialization ─────────────────────────────────────────────

def _materialize_approved_plan(packet_path: Path, verdict_dict: dict) -> None:
    """
    Write plan-materialization files IFF gate == PLAN_REVIEW AND verdict == APPROVED.
    All other combinations must NOT call this function.
    """
    assert verdict_dict["gate"] == "PLAN_REVIEW", "BUG: only call for PLAN_REVIEW"
    assert verdict_dict["verdict"] == "APPROVED", "BUG: only call for APPROVED"

    state_dir = Path(".claude/state")
    state_dir.mkdir(parents=True, exist_ok=True)
    active_dir = state_dir / "active"
    active_dir.mkdir(parents=True, exist_ok=True)

    # current-approved-plan.toml — byte-copy of input packet
    (state_dir / "current-approved-plan.toml").write_bytes(packet_path.read_bytes())

    # last-chatgpt-verdict.toml
    verdict_toml = (
        f'gate = "PLAN_REVIEW"\n'
        f'verdict = "APPROVED"\n'
        f'issue = {verdict_dict["issue"]}\n'
        f'approved_at = {_toml_str_value(datetime.now(timezone.utc).isoformat())}\n'
        f'next_action = {_toml_str_value(verdict_dict["next_action"])}\n'
    )
    (state_dir / "last-chatgpt-verdict.toml").write_text(verdict_toml, encoding="utf-8")

    # active/EXECUTOR_PROMPT.md — from template if present, else minimal
    template_path = Path(".claude/templates/EXECUTOR_PROMPT.md.template")
    if template_path.exists():
        template_content = template_path.read_text(encoding="utf-8")
        executor_content = template_content.replace("{{ISSUE}}", str(verdict_dict["issue"]))
        executor_content = executor_content.replace("{{GATE}}", "PLAN_REVIEW")
    else:
        executor_content = (
            f"# Executor Prompt — Issue {verdict_dict['issue']}\n\n"
            f"Plan approved. Proceed with implementation per `current-approved-plan.toml`.\n"
        )
    (active_dir / "EXECUTOR_PROMPT.md").write_text(executor_content, encoding="utf-8")

    # active/RESUME_CHECKPOINT.md
    checkpoint = (
        f"# Resume Checkpoint\n\n"
        f"- Issue: {verdict_dict['issue']}\n"
        f"- Gate: PLAN_REVIEW\n"
        f"- Verdict: APPROVED\n"
        f"- Approved at: {datetime.now(timezone.utc).isoformat()}\n"
        f"- Next: begin implementation per `current-approved-plan.toml`\n"
    )
    (active_dir / "RESUME_CHECKPOINT.md").write_text(checkpoint, encoding="utf-8")


# ── Local schema validation ───────────────────────────────────────────────────

def _validate_verdict(data: dict, *, expected_gate: str | None = None) -> None:
    """
    Local jsonschema re-validation (defense-in-depth).
    Raises MalformedResponseError on schema violation.
    Then enforces per-gate verdict enum.
    If *expected_gate* is given, also verifies the response gate matches —
    guards against a confused-deputy attack where the API returns a verdict
    for a different gate than was submitted.
    """
    import jsonschema  # noqa: PLC0415

    try:
        jsonschema.validate(instance=data, schema=VERDICT_SCHEMA)
    except jsonschema.ValidationError as exc:
        raise MalformedResponseError(
            f"Verdict fails schema validation: {exc.message}", raw_text=json.dumps(data)
        ) from None

    gate = data.get("gate", "")
    verdict = data.get("verdict", "")

    # Cross-check: API must echo back the same gate we submitted.
    if expected_gate is not None and gate != expected_gate:
        raise MalformedResponseError(
            f"Response gate '{gate}' does not match submitted gate '{expected_gate}'",
            raw_text=json.dumps(data),
        )

    allowed = PER_GATE_ENUMS.get(gate, [])
    if verdict not in allowed:
        raise MalformedResponseError(
            f"Verdict '{verdict}' is not valid for gate '{gate}'. "
            f"Allowed: {allowed}",
            raw_text=json.dumps(data),
        )


# ── CLI ───────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="openai_gate",
        description="Submit a gate packet to OpenAI and receive a structured verdict.",
    )
    parser.add_argument("--issue", type=int, required=True, help="GitHub issue number")
    parser.add_argument(
        "--gate",
        required=True,
        choices=list(PER_GATE_ENUMS.keys()),
        help="Gate type",
    )
    parser.add_argument("--input", required=True, help="Path to input TOML packet")
    parser.add_argument(
        "--model",
        default="gpt-4o-2024-08-06",
        help="OpenAI model (default: gpt-4o-2024-08-06)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview only — no API call, no key required",
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=1,
        help="Maximum API call attempts (default: 1)",
    )
    parser.add_argument(
        "--max-input-bytes",
        type=int,
        default=65536,
        help="Maximum input file size in bytes (default: 65536 = 64 KB)",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=4000,
        help="Maximum output tokens (default: 4000)",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=60,
        help="API call timeout in seconds (default: 60)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Entry point. Returns exit code."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    input_path = Path(args.input)

    # ── AC10: dry-run — no key required, no API call ──────────────────────────
    if args.dry_run:
        char_estimate = 0
        if input_path.exists():
            char_estimate = len(input_path.read_text(encoding="utf-8", errors="replace"))
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        artifact_dir = _artifact_dir(args.issue, args.gate, ts)
        print(f"[DRY-RUN] issue={args.issue}")
        print(f"[DRY-RUN] gate={args.gate}")
        print(f"[DRY-RUN] model={args.model}")
        print(f"[DRY-RUN] input={args.input}")
        print(f"[DRY-RUN] input-chars={char_estimate}")
        print(f"[DRY-RUN] output-dir={artifact_dir}")
        print("[DRY-RUN] No API call made.")
        return 0

    # ── AC1: key check (only for non-dry-run) ─────────────────────────────────
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 2

    # ── AC2: input file existence ──────────────────────────────────────────────
    if not input_path.exists():
        print(f"Input file not found: {args.input}", file=sys.stderr)
        return 4

    # ── AC2: size limit ────────────────────────────────────────────────────────
    file_size = input_path.stat().st_size
    if file_size > args.max_input_bytes:
        print(
            f"Input file exceeds max-input-bytes ({file_size} > {args.max_input_bytes})",
            file=sys.stderr,
        )
        return 5

    # ── AC3: secret scanner ────────────────────────────────────────────────────
    try:
        packet_text = input_path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"Cannot read input file: {exc}", file=sys.stderr)
        return 4

    try:
        scan_for_secrets(packet_text)
    except SecretInInputError as exc:
        print(str(exc), file=sys.stderr)
        return 6

    ts_start = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ts_dir = ts_start
    artifact_dir = _artifact_dir(args.issue, args.gate, ts_dir)

    # ── AC4/AC5: call adapter ─────────────────────────────────────────────────
    raw_text = ""
    verdict_dict: dict | None = None
    request_id: str | None = None
    error_dict: dict | None = None
    exit_code = 0

    attempt = 0
    last_error: Exception | None = None

    while attempt < args.max_attempts:
        attempt += 1
        try:
            verdict_dict, request_id = call_openai_structured_verdict(
                packet=packet_text,
                gate=args.gate,
                schema=VERDICT_SCHEMA,
                model=args.model,
                max_output_tokens=args.max_output_tokens,
                timeout_seconds=args.timeout_seconds,
            )
            raw_text = json.dumps(verdict_dict)
            last_error = None
            break
        except MalformedResponseError as exc:
            last_error = exc
            raw_text = redact_secrets(exc.raw_text)
            break  # no retry on malformed
        except NetworkTimeoutError as exc:
            last_error = exc
            if attempt >= args.max_attempts:
                break
        except OpenAIShapeError as exc:
            last_error = exc
            break
        except MissingKeyError as exc:
            # Shouldn't reach here (checked above), but be safe
            print("OPENAI_API_KEY is not set", file=sys.stderr)
            return 2

    ts_end = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    if last_error is not None:
        if isinstance(last_error, NetworkTimeoutError):
            exit_code = 7
            error_dict = {"error_type": "NetworkTimeout", "message": str(last_error)}
        elif isinstance(last_error, MalformedResponseError):
            exit_code = 3
            error_dict = {"error_type": "MalformedResponse", "message": str(last_error)}
        elif isinstance(last_error, OpenAIShapeError):
            exit_code = 8
            error_dict = {"error_type": "APIError", "message": str(last_error)}
        else:
            exit_code = 8
            error_dict = {"error_type": "UnknownError", "message": "Unexpected error"}

        _write_artifacts(
            artifact_dir,
            packet_path=input_path,
            raw_text=raw_text,
            verdict_dict=None,
            error_dict=error_dict,
            model=args.model,
            gate=args.gate,
            issue=args.issue,
            ts_start=ts_start,
            ts_end=ts_end,
            request_id=request_id,
        )
        _append_index(args.issue, args.gate, ts_dir, None, error_dict["error_type"])
        print(f"Gate run failed: {error_dict['message']}", file=sys.stderr)
        return exit_code

    # ── AC6: local jsonschema re-validation ───────────────────────────────────
    try:
        _validate_verdict(verdict_dict, expected_gate=args.gate)
    except MalformedResponseError as exc:
        exit_code = 3
        error_dict = {"error_type": "SchemaValidationFailed", "message": str(exc)}
        _write_artifacts(
            artifact_dir,
            packet_path=input_path,
            raw_text=redact_secrets(exc.raw_text),
            verdict_dict=None,
            error_dict=error_dict,
            model=args.model,
            gate=args.gate,
            issue=args.issue,
            ts_start=ts_start,
            ts_end=ts_end,
            request_id=request_id,
        )
        _append_index(args.issue, args.gate, ts_dir, None, "SchemaValidationFailed")
        print(f"Verdict schema validation failed: {exc}", file=sys.stderr)
        return 3

    # ── AC8: write artifacts ──────────────────────────────────────────────────
    _write_artifacts(
        artifact_dir,
        packet_path=input_path,
        raw_text=raw_text,
        verdict_dict=verdict_dict,
        error_dict=None,
        model=args.model,
        gate=args.gate,
        issue=args.issue,
        ts_start=ts_start,
        ts_end=ts_end,
        request_id=request_id,
    )
    _append_index(args.issue, args.gate, ts_dir, verdict_dict["verdict"], None)

    # ── AC9: materialization (PLAN_REVIEW APPROVED only) ─────────────────────
    # Use verdict_dict["gate"] (validated API response) rather than args.gate
    # (CLI input) so both sides of the condition come from the validated copy.
    if verdict_dict["gate"] == "PLAN_REVIEW" and verdict_dict["verdict"] == "APPROVED":
        _materialize_approved_plan(input_path, verdict_dict)
        print(f"APPROVED — plan materialized to .claude/state/current-approved-plan.toml")
    else:
        print(
            f"Gate: {verdict_dict['gate']} | Verdict: {verdict_dict['verdict']} | "
            f"Artifacts: {artifact_dir}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
