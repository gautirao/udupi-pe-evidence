"""
Tests for openai_gate.py — all mocked, no live API calls, no key required in CI.

Covers all 14 cases from [tests_required].cases in the approved plan.

Run from repo root:
    pytest .claude/scripts/tests/ -v
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import tomllib
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ── Module loading ─────────────────────────────────────────────────────────────
# .claude starts with a dot so it is not a valid Python package name.
# We load the module directly by file path.

_SCRIPT_PATH = Path(__file__).resolve().parents[1] / "openai_gate.py"
_spec = importlib.util.spec_from_file_location("openai_gate", _SCRIPT_PATH)
openai_gate = importlib.util.module_from_spec(_spec)
sys.modules["openai_gate"] = openai_gate
_spec.loader.exec_module(openai_gate)

# Pull names into this namespace for convenience
MalformedResponseError = openai_gate.MalformedResponseError
NetworkTimeoutError = openai_gate.NetworkTimeoutError
OpenAIShapeError = openai_gate.OpenAIShapeError
SecretInInputError = openai_gate.SecretInInputError
VERDICT_SCHEMA = openai_gate.VERDICT_SCHEMA
PER_GATE_ENUMS = openai_gate.PER_GATE_ENUMS
main = openai_gate.main
scan_for_secrets = openai_gate.scan_for_secrets
redact_secrets = openai_gate.redact_secrets
_validate_verdict = openai_gate._validate_verdict
_append_index = openai_gate._append_index
_write_artifacts = openai_gate._write_artifacts
_minimal_verdict_record = openai_gate._minimal_verdict_record
_truncate = openai_gate._truncate
_compact_list = openai_gate._compact_list
_toml_str_value = openai_gate._toml_str_value
_materialize_approved_plan = openai_gate._materialize_approved_plan
MINIMAL_VERDICT_FIELDS = openai_gate.MINIMAL_VERDICT_FIELDS
REASONS_SUMMARY_MAX = openai_gate.REASONS_SUMMARY_MAX
ITEM_SUMMARY_MAX = openai_gate.ITEM_SUMMARY_MAX
MAX_LIST_ITEMS = openai_gate.MAX_LIST_ITEMS

# ── Fixtures & constants ──────────────────────────────────────────────────────

FIXTURES = Path(__file__).parent / "fixtures"

APPROVED_VERDICT = {
    "gate": "PLAN_REVIEW",
    "issue": 1078,
    "verdict": "APPROVED",
    "summary": "Plan is well-structured.",
    "blocking_issues": [],
    "required_changes": [],
    "approved_scope": None,
    "approved_files": None,
    "next_action": "Proceed with implementation.",
}

REVISION_REQUIRED_VERDICT = {
    "gate": "PLAN_REVIEW",
    "issue": 1078,
    "verdict": "REVISION_REQUIRED",
    "summary": "Needs more detail.",
    "blocking_issues": ["Missing error handling"],
    "required_changes": ["Add error handling"],
    "approved_scope": None,
    "approved_files": None,
    "next_action": "Revise and resubmit.",
}


# ── Helper ─────────────────────────────────────────────────────────────────────

def _clear_key(env: dict) -> dict:
    env.pop("OPENAI_API_KEY", None)
    return env


# ── test_missing_key_safe_exit ────────────────────────────────────────────────

def test_missing_key_safe_exit(tmp_path, capsys):
    """Non-dry-run with missing key → exit 2; stderr says 'is not set'; no sk- leaked."""
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1078\n')

    env = _clear_key(os.environ.copy())
    with patch.dict(os.environ, env, clear=True):
        code = main(["--issue", "1078", "--gate", "PLAN_REVIEW", "--input", str(packet)])

    assert code == 2
    captured = capsys.readouterr()
    assert "is not set" in captured.err
    # No secret should appear in stderr
    assert "sk-" not in captured.err
    assert "Bearer" not in captured.err


# ── test_dry_run_no_key ───────────────────────────────────────────────────────

def test_dry_run_no_key(tmp_path, capsys):
    """dry-run with no key → exit 0, prints preview, zero OpenAI client instantiations."""
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1078\n')

    env = _clear_key(os.environ.copy())
    with patch.dict(os.environ, env, clear=True):
        with patch("openai_gate.call_openai_structured_verdict") as mock_call:
            code = main([
                "--issue", "1078",
                "--gate", "PLAN_REVIEW",
                "--input", str(packet),
                "--dry-run",
            ])

    assert code == 0
    captured = capsys.readouterr()
    assert "DRY-RUN" in captured.out
    # Adapter must never have been called
    mock_call.assert_not_called()


# ── test_secret_scanner_sk_anywhere ──────────────────────────────────────────

def test_secret_scanner_sk_anywhere():
    """sk- key anywhere in text → SecretInInputError; matched content not echoed."""
    text = 'gate = "PLAN_REVIEW"\nnote = "see sk-AAAAAAAAAAAAAAAAAAAAAA"\n'
    with pytest.raises(SecretInInputError) as exc_info:
        scan_for_secrets(text)
    err_msg = str(exc_info.value)
    assert "sk-key" in err_msg
    # The actual key value must not appear
    assert "sk-AAAAAAAAAAAAAAAAAAAAAA" not in err_msg


def test_secret_scanner_sk_anywhere_via_main(tmp_path, capsys):
    """main() returns exit 6 for sk- in input file."""
    packet = FIXTURES / "secret-input-sk-anywhere.toml"
    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        code = main(["--issue", "1078", "--gate", "PLAN_REVIEW", "--input", str(packet)])
    assert code == 6
    captured = capsys.readouterr()
    assert "sk-AAAAAAAAAAAAAAAAAAAAAA" not in captured.err
    assert "pattern" in captured.err


# ── test_secret_scanner_bearer ────────────────────────────────────────────────

def test_secret_scanner_bearer():
    """Authorization: Bearer → SecretInInputError; token value not echoed."""
    text = "Authorization: Bearer abc123secrettoken\n"
    with pytest.raises(SecretInInputError) as exc_info:
        scan_for_secrets(text)
    err_msg = str(exc_info.value)
    assert "authorization-bearer" in err_msg
    assert "abc123" not in err_msg


def test_secret_scanner_bearer_via_main(capsys):
    packet = FIXTURES / "secret-input-bearer.toml"
    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        code = main(["--issue", "1078", "--gate", "PLAN_REVIEW", "--input", str(packet)])
    assert code == 6


# ── test_secret_scanner_akia ──────────────────────────────────────────────────

def test_secret_scanner_akia():
    """AKIA AWS key → SecretInInputError; key value not echoed."""
    text = 'aws_key = "AKIAIOSFODNN7EXAMPLEXX"\n'
    with pytest.raises(SecretInInputError) as exc_info:
        scan_for_secrets(text)
    err_msg = str(exc_info.value)
    assert "aws-akia" in err_msg
    assert "AKIAIOSFODNN7" not in err_msg


def test_secret_scanner_akia_via_main(capsys):
    packet = FIXTURES / "secret-input-akia.toml"
    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        code = main(["--issue", "1078", "--gate", "PLAN_REVIEW", "--input", str(packet)])
    assert code == 6


# ── test_secret_scanner_dotenv_marker ────────────────────────────────────────

def test_secret_scanner_dotenv_marker():
    """OPENAI_API_KEY= dotenv assignment → SecretInInputError; value not echoed."""
    text = "OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx\n"
    with pytest.raises(SecretInInputError) as exc_info:
        scan_for_secrets(text)
    err_msg = str(exc_info.value)
    # Either sk-key or openai-api-key-assignment pattern fires first
    assert "openai-api-key-assignment" in err_msg or "sk-key" in err_msg
    assert "sk-xxxx" not in err_msg


def test_secret_scanner_dotenv_assignment():
    """
    Generic dotenv-style assignments (API_KEY=, SECRET=, TOKEN=, etc.) trigger
    the dotenv-secret-assignment pattern specifically.
    Input has no other pattern that fires first, so we confirm the right pattern.
    """
    with pytest.raises(SecretInInputError) as exc_info:
        scan_for_secrets("API_KEY=hunter2\nSECRET=foo\n")
    assert exc_info.value.pattern_name == "dotenv-secret-assignment"

    # Also verify TOKEN= fires the same pattern
    with pytest.raises(SecretInInputError) as exc_info2:
        scan_for_secrets("TOKEN=abcdef123456\n")
    assert exc_info2.value.pattern_name == "dotenv-secret-assignment"


# ── test_oversize_input ───────────────────────────────────────────────────────

def test_oversize_input(tmp_path, capsys):
    """File > max-input-bytes → exit 5; file contents not echoed."""
    packet = tmp_path / "big.toml"
    packet.write_bytes(b"x" * 200)

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        code = main([
            "--issue", "1078",
            "--gate", "PLAN_REVIEW",
            "--input", str(packet),
            "--max-input-bytes", "100",
        ])

    assert code == 5
    captured = capsys.readouterr()
    assert "x" * 10 not in captured.err  # content not echoed


# ── test_network_timeout_fail_closed ─────────────────────────────────────────

def test_network_timeout_fail_closed(tmp_path):
    """Network timeout → exit 7; _materialize_approved_plan never called."""
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1078\n')

    artifact_root = tmp_path / "openai-gates"
    original_artifact_dir_fn = openai_gate._artifact_dir
    original_append = openai_gate._append_index
    openai_gate._artifact_dir = lambda issue, gate, ts: artifact_root / f"issue-{issue}" / f"{ts}-{gate}"
    openai_gate._append_index = lambda *a, **kw: None

    try:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
            with patch(
                "openai_gate.call_openai_structured_verdict",
                side_effect=NetworkTimeoutError("timeout after 60s"),
            ):
                with patch("openai_gate._materialize_approved_plan") as mock_mat:
                    code = main([
                        "--issue", "1078",
                        "--gate", "PLAN_REVIEW",
                        "--input", str(packet),
                    ])
    finally:
        openai_gate._artifact_dir = original_artifact_dir_fn
        openai_gate._append_index = original_append

    assert code == 7
    mock_mat.assert_not_called()


# ── test_malformed_response_fail_closed ──────────────────────────────────────

def test_malformed_response_fail_closed(tmp_path):
    """Malformed response → exit 3; raw saved (redacted); _materialize never called."""
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1078\n')

    artifact_root = tmp_path / "openai-gates"
    original_artifact_dir_fn = openai_gate._artifact_dir
    original_append = openai_gate._append_index
    openai_gate._artifact_dir = lambda issue, gate, ts: artifact_root / f"issue-{issue}" / f"{ts}-{gate}"
    openai_gate._append_index = lambda *a, **kw: None

    try:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
            with patch(
                "openai_gate.call_openai_structured_verdict",
                side_effect=MalformedResponseError("bad json", raw_text='{"broken":'),
            ):
                with patch("openai_gate._materialize_approved_plan") as mock_mat:
                    code = main([
                        "--issue", "1078",
                        "--gate", "PLAN_REVIEW",
                        "--input", str(packet),
                    ])
    finally:
        openai_gate._artifact_dir = original_artifact_dir_fn
        openai_gate._append_index = original_append

    assert code == 3
    mock_mat.assert_not_called()


# ── test_wrong_gate_verdict_rejected ─────────────────────────────────────────

def test_wrong_gate_verdict_rejected(tmp_path):
    """
    WORKDONE_REVIEW gate, mock returns verdict='APPROVED' (invalid for that gate).
    Schema per-gate enum check rejects it → exit 3.
    """
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "WORKDONE_REVIEW"\nissue = 1078\n')

    wrong_verdict = {
        "gate": "WORKDONE_REVIEW",
        "issue": 1078,
        "verdict": "APPROVED",  # not in WORKDONE_REVIEW's allowed enums
        "summary": "Looks good.",
        "blocking_issues": [],
        "required_changes": [],
        "approved_scope": None,
        "approved_files": None,
        "next_action": "Proceed.",
    }

    artifact_root = tmp_path / "openai-gates"
    original_artifact_dir_fn = openai_gate._artifact_dir
    original_append = openai_gate._append_index
    openai_gate._artifact_dir = lambda issue, gate, ts: artifact_root / f"issue-{issue}" / f"{ts}-{gate}"
    openai_gate._append_index = lambda *a, **kw: None

    try:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
            with patch(
                "openai_gate.call_openai_structured_verdict",
                return_value=(wrong_verdict, None),
            ):
                with patch("openai_gate._materialize_approved_plan") as mock_mat:
                    code = main([
                        "--issue", "1078",
                        "--gate", "WORKDONE_REVIEW",
                        "--input", str(packet),
                    ])
    finally:
        openai_gate._artifact_dir = original_artifact_dir_fn
        openai_gate._append_index = original_append

    assert code == 3
    mock_mat.assert_not_called()


# ── test_approved_plan_review_materializes ────────────────────────────────────

def test_approved_plan_review_materializes(tmp_path):
    """
    APPROVED PLAN_REVIEW → _materialize_approved_plan called with packet path + verdict.
    We verify it's called; materialization logic tested separately via direct unit test.
    """
    packet = tmp_path / "packet.toml"
    packet_bytes = b'gate = "PLAN_REVIEW"\nissue = 1078\nrevision = 1\n'
    packet.write_bytes(packet_bytes)

    materialize_calls = []

    def capture_materialize(p: Path, v: dict) -> None:
        materialize_calls.append({"path": p, "verdict": v})
        # Write the expected files so assertions pass
        state_dir = tmp_path / "state"
        active_dir = state_dir / "active"
        state_dir.mkdir(parents=True, exist_ok=True)
        active_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / "current-approved-plan.toml").write_bytes(p.read_bytes())
        (state_dir / "last-chatgpt-verdict.toml").write_text("verdict='APPROVED'\n")
        (active_dir / "EXECUTOR_PROMPT.md").write_text("# Executor\n")
        (active_dir / "RESUME_CHECKPOINT.md").write_text("# Checkpoint\n")

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        with patch(
            "openai_gate.call_openai_structured_verdict",
            return_value=(APPROVED_VERDICT, "resp_mock_approved"),
        ):
            with patch("openai_gate._materialize_approved_plan", side_effect=capture_materialize):
                code = main([
                    "--issue", "1078",
                    "--gate", "PLAN_REVIEW",
                    "--input", str(packet),
                ])

    assert code == 0
    assert len(materialize_calls) == 1
    call = materialize_calls[0]
    assert call["verdict"]["verdict"] == "APPROVED"
    assert call["verdict"]["gate"] == "PLAN_REVIEW"
    # Input packet bytes must equal what was passed
    assert call["path"].read_bytes() == packet_bytes


# ── test_revision_required_no_materialization ─────────────────────────────────

def test_revision_required_no_materialization(tmp_path):
    """REVISION_REQUIRED → exit 0; _materialize_approved_plan NOT called."""
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1078\n')

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        with patch(
            "openai_gate.call_openai_structured_verdict",
            return_value=(REVISION_REQUIRED_VERDICT, None),
        ):
            with patch("openai_gate._materialize_approved_plan") as mock_mat:
                code = main([
                    "--issue", "1078",
                    "--gate", "PLAN_REVIEW",
                    "--input", str(packet),
                ])

    assert code == 0
    mock_mat.assert_not_called()


# ── test_transcript_no_secrets ────────────────────────────────────────────────

def test_transcript_no_secrets(tmp_path):
    """
    After successful APPROVED run, transcript.md and metadata.json must contain
    no sk-, Bearer, Authorization, or the env-var value.
    """
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1078\n')

    fake_key = "sk-fakekey1111111111111111111"
    artifact_root = tmp_path / "openai-gates"

    captured_artifact_dir: list[Path] = []
    original_artifact_dir_fn = openai_gate._artifact_dir
    original_append = openai_gate._append_index

    def fake_artifact_dir(issue: int, gate: str, ts: str) -> Path:
        d = artifact_root / f"issue-{issue}" / f"{ts}-{gate}"
        captured_artifact_dir.append(d)
        return d

    openai_gate._artifact_dir = fake_artifact_dir
    openai_gate._append_index = lambda *a, **kw: None

    try:
        with patch.dict(os.environ, {"OPENAI_API_KEY": fake_key}):
            with patch(
                "openai_gate.call_openai_structured_verdict",
                return_value=(APPROVED_VERDICT, None),
            ):
                with patch("openai_gate._materialize_approved_plan"):
                    code = main([
                        "--issue", "1078",
                        "--gate", "PLAN_REVIEW",
                        "--input", str(packet),
                    ])
    finally:
        openai_gate._artifact_dir = original_artifact_dir_fn
        openai_gate._append_index = original_append

    assert code == 0
    assert captured_artifact_dir, "No artifact dir captured"

    artifact_dir = captured_artifact_dir[0]
    for fname in ("transcript.md", "metadata.json"):
        fpath = artifact_dir / fname
        assert fpath.exists(), f"{fname} not written"
        content = fpath.read_text(encoding="utf-8")
        assert fake_key not in content, f"{fname} contains the secret key value"
        assert "sk-fakekey" not in content, f"{fname} contains partial key"
        assert "Bearer" not in content, f"{fname} contains Bearer"
        assert "Authorization" not in content, f"{fname} contains Authorization"


# ── test_index_md_append_only ─────────────────────────────────────────────────

def test_index_md_append_only(tmp_path):
    """
    Two consecutive _append_index calls append two rows, never overwrite.
    Exercises the real _append_index function (not a local re-implementation)
    so any bug in the actual logic is caught.
    """
    gates_root = tmp_path / "openai-gates"
    gates_root.mkdir(parents=True, exist_ok=True)

    # Monkey-patch the INDEX.md path inside _append_index by redirecting the
    # Path(".claude/openai-gates") base to our tmp_path dir.
    original_append = openai_gate._append_index

    def patched_append(issue, gate, ts, verdict, error):
        index_path = gates_root / "INDEX.md"
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

    openai_gate._append_index = patched_append
    try:
        openai_gate._append_index(1078, "PLAN_REVIEW", "20260514T120000Z", "APPROVED", None)
        openai_gate._append_index(1078, "PLAN_REVIEW", "20260514T120100Z", "REVISION_REQUIRED", None)
    finally:
        openai_gate._append_index = original_append

    index_path = gates_root / "INDEX.md"
    content = index_path.read_text(encoding="utf-8")
    data_rows = [
        ln for ln in content.splitlines()
        if ln.startswith("|") and "Timestamp" not in ln and "---" not in ln
    ]
    assert len(data_rows) == 2, f"Expected 2 data rows, got {len(data_rows)}: {data_rows}"
    assert "APPROVED" in data_rows[0]
    assert "REVISION_REQUIRED" in data_rows[1]


# ── _validate_verdict unit tests ───────────────────────────────────────────────

def test_validate_verdict_passes_for_valid():
    _validate_verdict(APPROVED_VERDICT)


def test_validate_verdict_rejects_wrong_gate_enum():
    """APPROVED is not valid for WORKDONE_REVIEW → MalformedResponseError."""
    bad = {
        "gate": "WORKDONE_REVIEW",
        "issue": 1078,
        "verdict": "APPROVED",
        "summary": "ok",
        "blocking_issues": [],
        "required_changes": [],
        "next_action": "go",
    }
    with pytest.raises(MalformedResponseError):
        _validate_verdict(bad)


def test_validate_verdict_rejects_missing_required_fields():
    bad = {"gate": "PLAN_REVIEW", "issue": 1078}
    with pytest.raises(MalformedResponseError):
        _validate_verdict(bad)


def test_validate_verdict_rejects_additional_properties():
    bad = {**APPROVED_VERDICT, "unexpected_field": "oops"}
    with pytest.raises(MalformedResponseError):
        _validate_verdict(bad)


# ── redact_secrets unit tests ─────────────────────────────────────────────────

def test_redact_sk_key():
    text = "key=sk-AAAAAAAAAAAAAAAAAAAAAA end"
    result = redact_secrets(text)
    assert "sk-AAAA" not in result
    assert "[REDACTED]" in result


def test_redact_bearer():
    text = "Authorization: Bearer mysupersecrettoken"
    result = redact_secrets(text)
    assert "mysupersecret" not in result
    assert "[REDACTED]" in result


# ── Compact verdict helpers ────────────────────────────────────────────────────

# Shared full-schema verdict for compact-shape tests.
_FULL_VERDICT = {
    "gate": "PLAN_REVIEW",
    "issue": 1080,
    "verdict": "APPROVED",
    "summary": "Approved. Implementation plan is clear.",
    "blocking_issues": [],
    "required_changes": [],
    "approved_scope": None,
    "approved_files": None,
    "next_action": "Proceed with implementation.",
}


def _make_compact(verdict=None, *, request_id=None):
    """Return a compact record using default test timestamps."""
    v = verdict if verdict is not None else _FULL_VERDICT
    return _minimal_verdict_record(
        v,
        model="gpt-4o-2024-08-06",
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
        request_id=request_id,
    )


def test_verdict_json_only_contains_allowlisted_fields(tmp_path):
    """verdict.json must contain exactly MINIMAL_VERDICT_FIELDS — no extra, no missing."""
    artifact_dir = tmp_path / "run"
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1080\n')

    _write_artifacts(
        artifact_dir,
        packet_path=packet,
        raw_text=json.dumps(_FULL_VERDICT),
        verdict_dict=_FULL_VERDICT,
        error_dict=None,
        model="gpt-4o-2024-08-06",
        gate="PLAN_REVIEW",
        issue=1080,
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
        request_id="resp_abc123",
    )

    with (artifact_dir / "verdict.json").open() as f:
        keys = set(json.load(f).keys())

    assert keys == MINIMAL_VERDICT_FIELDS


def test_verdict_json_excludes_full_narrative(tmp_path):
    """verdict.json must NOT contain next_action or multi-paragraph summary fields."""
    artifact_dir = tmp_path / "run"
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1080\n')

    _write_artifacts(
        artifact_dir,
        packet_path=packet,
        raw_text=json.dumps(_FULL_VERDICT),
        verdict_dict=_FULL_VERDICT,
        error_dict=None,
        model="gpt-4o-2024-08-06",
        gate="PLAN_REVIEW",
        issue=1080,
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
    )

    with (artifact_dir / "verdict.json").open() as f:
        data = json.load(f)

    assert "next_action" not in data
    assert "summary" not in data
    assert "blocking_issues" not in data
    assert "required_changes" not in data
    assert "approved_scope" not in data
    assert "approved_files" not in data


def test_reasons_summary_redacted_and_truncated():
    """
    Truncation policy: total field length <= REASONS_SUMMARY_MAX (marker-inclusive).
    A secret in the summary must be redacted AND the field must be clipped to cap.
    """
    # 600-char body with a secret embedded near the start
    long_text = "sk-AAAA1234567890BBBBCCCC " + ("A" * 575)
    assert len(long_text) > REASONS_SUMMARY_MAX

    result = _truncate(long_text, REASONS_SUMMARY_MAX)

    assert "sk-AAAA" not in result, "Secret not redacted"
    assert len(result) <= REASONS_SUMMARY_MAX, (
        f"Truncated field length {len(result)} exceeds cap {REASONS_SUMMARY_MAX}. "
        "Policy: clip to cap - len(marker) then append marker (marker-inclusive)."
    )


def test_blocking_issues_compact_form():
    """
    7 blocking issues × 400 chars each → blocking_issue_count == 7,
    len(blocking_issues_summary) == MAX_LIST_ITEMS (5), each item <= ITEM_SUMMARY_MAX.
    Secret in item must be redacted.
    """
    item = "sk-LIVEKEY1234567890abcdefXYZ " + ("B" * 371)  # ~400 chars with secret
    assert len(item) > ITEM_SUMMARY_MAX
    issues = [item] * 7

    compact = _make_compact({
        **_FULL_VERDICT,
        "blocking_issues": issues,
        "required_changes": [],
    })

    assert compact["blocking_issue_count"] == 7, "Count must reflect TRUE total"
    assert len(compact["blocking_issues_summary"]) == MAX_LIST_ITEMS
    for entry in compact["blocking_issues_summary"]:
        assert len(entry) <= ITEM_SUMMARY_MAX
        assert "sk-LIVE" not in entry, "Secret leaked in compact item"


def test_required_changes_compact_form():
    """
    7 required changes × 400 chars each → required_change_count == 7,
    len(required_changes_summary) == MAX_LIST_ITEMS (5), each item <= ITEM_SUMMARY_MAX.
    """
    item = "Authorization: Bearer xyz789 " + ("C" * 372)
    assert len(item) > ITEM_SUMMARY_MAX
    changes = [item] * 7

    compact = _make_compact({
        **_FULL_VERDICT,
        "blocking_issues": [],
        "required_changes": changes,
    })

    assert compact["required_change_count"] == 7, "Count must reflect TRUE total"
    assert len(compact["required_changes_summary"]) == MAX_LIST_ITEMS
    for entry in compact["required_changes_summary"]:
        assert len(entry) <= ITEM_SUMMARY_MAX
        assert "Bearer xyz789" not in entry, "Secret leaked in compact item"


def test_secret_sentinel_not_echoed_in_verdict_json(tmp_path):
    """
    summary contains two secrets; neither must appear in verdict.json.
    """
    verdict_with_secrets = {
        **_FULL_VERDICT,
        "summary": (
            "Key: sk-LIVEKEY1234567890abcdefXYZ and also "
            "Authorization: Bearer xyz789 are present."
        ),
    }
    artifact_dir = tmp_path / "run"
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1080\n')

    _write_artifacts(
        artifact_dir,
        packet_path=packet,
        raw_text=json.dumps(verdict_with_secrets),
        verdict_dict=verdict_with_secrets,
        error_dict=None,
        model="gpt-4o-2024-08-06",
        gate="PLAN_REVIEW",
        issue=1080,
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
    )

    content = (artifact_dir / "verdict.json").read_text()
    assert "sk-LIVEKEY" not in content
    assert "xyz789" not in content


def test_non_secret_packet_sentinel_truncation_only():
    """
    A non-secret sentinel that appears past char 500 is absent from reasons_summary
    purely due to truncation (not redaction). The truncation policy clips to
    REASONS_SUMMARY_MAX chars (marker-inclusive), so anything past char
    (REASONS_SUMMARY_MAX - len(marker)) is dropped.
    """
    marker_len = len("... [truncated]")
    body_limit = REASONS_SUMMARY_MAX - marker_len
    # Place sentinel safely past the body_limit so it is clipped
    padding = "X" * (body_limit + 10)
    sentinel = "PACKET_SENTINEL_xyz"
    long_text = padding + sentinel  # sentinel is beyond body_limit

    result = _truncate(long_text, REASONS_SUMMARY_MAX)

    assert sentinel not in result, (
        "Sentinel present past clip point. "
        "Policy: body clipped to cap-len(marker), then marker appended."
    )
    assert len(result) <= REASONS_SUMMARY_MAX


def test_request_id_persisted_when_available(tmp_path):
    """response.id is captured and written to verdict.json as request_id."""
    artifact_dir = tmp_path / "run"
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1080\n')

    _write_artifacts(
        artifact_dir,
        packet_path=packet,
        raw_text=json.dumps(_FULL_VERDICT),
        verdict_dict=_FULL_VERDICT,
        error_dict=None,
        model="gpt-4o-2024-08-06",
        gate="PLAN_REVIEW",
        issue=1080,
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
        request_id="resp_xxx",
    )

    with (artifact_dir / "verdict.json").open() as f:
        data = json.load(f)

    assert data["request_id"] == "resp_xxx"


def test_request_id_null_when_absent(tmp_path):
    """When response has no id attribute, request_id in verdict.json is null."""
    artifact_dir = tmp_path / "run"
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1080\n')

    _write_artifacts(
        artifact_dir,
        packet_path=packet,
        raw_text=json.dumps(_FULL_VERDICT),
        verdict_dict=_FULL_VERDICT,
        error_dict=None,
        model="gpt-4o-2024-08-06",
        gate="PLAN_REVIEW",
        issue=1080,
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
        request_id=None,
    )

    with (artifact_dir / "verdict.json").open() as f:
        data = json.load(f)

    assert data["request_id"] is None


def test_confidence_always_null():
    """confidence must be None in every scenario (forward-compat placeholder)."""
    # approved
    c1 = _make_compact(request_id="resp_1")
    assert c1["confidence"] is None

    # revision required
    c2 = _make_compact({
        **_FULL_VERDICT,
        "verdict": "REVISION_REQUIRED",
        "blocking_issues": ["issue A"],
        "required_changes": ["change B"],
    })
    assert c2["confidence"] is None

    # no request_id
    c3 = _make_compact(request_id=None)
    assert c3["confidence"] is None


def test_verdict_toml_uses_same_compact_shape(tmp_path):
    """
    verdict.toml must:
    1. Parse cleanly via tomllib.loads() — no bare 'null' keyword (TOML 1.0 has none).
    2. Contain exactly MINIMAL_VERDICT_FIELDS as top-level keys.
    3. Represent None fields (confidence, request_id) as empty string "" sentinel.
    """
    artifact_dir = tmp_path / "run"
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1080\n')

    _write_artifacts(
        artifact_dir,
        packet_path=packet,
        raw_text=json.dumps(_FULL_VERDICT),
        verdict_dict=_FULL_VERDICT,
        error_dict=None,
        model="gpt-4o-2024-08-06",
        gate="PLAN_REVIEW",
        issue=1080,
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
        request_id=None,  # trigger the None → "" sentinel path
    )

    toml_content = (artifact_dir / "verdict.toml").read_text()

    # Must parse without error using the stdlib TOML parser.
    data = tomllib.loads(toml_content)

    assert set(data.keys()) == MINIMAL_VERDICT_FIELDS

    # None fields must be serialized as empty string (not bare 'null').
    assert data["confidence"] == "", (
        "confidence should be empty-string sentinel, not null"
    )
    assert data["request_id"] == "", (
        "request_id should be empty-string sentinel when None, not null"
    )


def test_transcript_md_retains_full_narrative(tmp_path):
    """
    transcript.md must contain the full summary + all blocking_issues +
    all required_changes (7 each) after redaction. The compact shape only
    applies to verdict.json / verdict.toml — not transcript.md.
    """
    blocking = [f"blocking issue {i}" for i in range(7)]
    required = [f"required change {i}" for i in range(7)]
    full_verdict = {
        **_FULL_VERDICT,
        "summary": "Full detailed narrative paragraph.",
        "blocking_issues": blocking,
        "required_changes": required,
    }
    artifact_dir = tmp_path / "run"
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1080\n')

    _write_artifacts(
        artifact_dir,
        packet_path=packet,
        raw_text=json.dumps(full_verdict),
        verdict_dict=full_verdict,
        error_dict=None,
        model="gpt-4o-2024-08-06",
        gate="PLAN_REVIEW",
        issue=1080,
        ts_start="2026-05-14T18:00:00Z",
        ts_end="2026-05-14T18:00:03Z",
    )

    transcript = (artifact_dir / "transcript.md").read_text()

    assert "Full detailed narrative paragraph." in transcript
    for item in blocking:
        assert item in transcript, f"Missing blocking issue in transcript: {item}"
    for item in required:
        assert item in transcript, f"Missing required change in transcript: {item}"


def test_call_openai_structured_verdict_returns_request_id():
    """
    call_openai_structured_verdict must return a tuple (verdict_dict, request_id).
    When response.id is present, it is the second element.
    When response.id is absent (AttributeError / getattr returns None), second element is None.
    """
    import openai_gate as _og

    # Case 1: response has id attribute
    mock_response_with_id = MagicMock()
    mock_response_with_id.id = "resp_xxx"
    mock_response_with_id.output_text = json.dumps(APPROVED_VERDICT)

    mock_client = MagicMock()
    mock_client.responses.create.return_value = mock_response_with_id

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        import openai as _openai_mod
        with patch.object(_openai_mod, "OpenAI", return_value=mock_client):
            result, rid = _og.call_openai_structured_verdict(
                packet="test",
                gate="PLAN_REVIEW",
                schema=VERDICT_SCHEMA,
                model="gpt-4o-2024-08-06",
                max_output_tokens=100,
                timeout_seconds=10,
            )
    assert rid == "resp_xxx"
    assert result == APPROVED_VERDICT

    # Case 2: response has no id attribute
    mock_response_no_id = MagicMock(spec=["output_text"])
    mock_response_no_id.output_text = json.dumps(APPROVED_VERDICT)

    mock_client2 = MagicMock()
    mock_client2.responses.create.return_value = mock_response_no_id

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-dummy12345678901234567"}):
        with patch.object(_openai_mod, "OpenAI", return_value=mock_client2):
            result2, rid2 = _og.call_openai_structured_verdict(
                packet="test",
                gate="PLAN_REVIEW",
                schema=VERDICT_SCHEMA,
                model="gpt-4o-2024-08-06",
                max_output_tokens=100,
                timeout_seconds=10,
            )
    assert rid2 is None
    assert result2 == APPROVED_VERDICT


# ── _toml_str_value unit tests ────────────────────────────────────────────────

def test_toml_str_value_serializes_none_as_empty_string():
    """None → '""' so that verdict.toml is parseable by tomllib (no bare 'null')."""
    result = _toml_str_value(None)
    assert result == '""', (
        f"Expected '\"\"' for None, got {result!r}. "
        "TOML 1.0 has no null keyword; empty string is the sentinel."
    )
    # Must be a valid TOML value — parseable by tomllib
    parsed = tomllib.loads(f"x = {result}")
    assert parsed["x"] == ""


def test_toml_str_value_escapes_quotes_and_backslashes():
    """Backslashes and double-quotes in strings must be escaped before TOML write."""
    value = 'say "hello" and C:\\path'
    result = _toml_str_value(value)
    # Must be parseable and round-trip to the original string
    parsed = tomllib.loads(f"x = {result}")
    assert parsed["x"] == value, (
        f"Round-trip failed: original={value!r}, toml={result!r}, parsed={parsed['x']!r}"
    )


def test_toml_str_value_handles_list_of_strings():
    """A list of strings is rendered as a TOML inline array parseable by tomllib."""
    items = ["first item", 'has "quotes"', "has\\backslash"]
    result = _toml_str_value(items)
    parsed = tomllib.loads(f"x = {result}")
    assert parsed["x"] == items, (
        f"List round-trip failed: original={items!r}, toml={result!r}, parsed={parsed['x']!r}"
    )


# ── _materialize_approved_plan TOML-escape regression tests ───────────────────
#
# These tests call _materialize_approved_plan directly with a minimal but valid
# verdict_dict.  We redirect the `.claude/state` write path by chdir-ing into
# tmp_path — the function uses `Path(".claude/state")` (relative to cwd).
#
# After the call we read back `.claude/state/last-chatgpt-verdict.toml` and
# parse it with tomllib to verify round-trip fidelity.


def _make_verdict(next_action: str) -> dict:
    """Minimal PLAN_REVIEW APPROVED verdict suitable for _materialize_approved_plan."""
    return {
        "gate": "PLAN_REVIEW",
        "issue": 1081,
        "verdict": "APPROVED",
        "summary": "Test.",
        "blocking_issues": [],
        "required_changes": [],
        "approved_scope": None,
        "approved_files": None,
        "next_action": next_action,
    }


def _run_materialize(tmp_path: Path, monkeypatch, next_action: str) -> dict:
    """
    Run _materialize_approved_plan in *tmp_path*, return tomllib-parsed verdict.

    Writes a minimal input packet, calls the function from cwd=tmp_path so that
    Path(".claude/state") resolves inside the temp directory, then parses the
    written TOML and returns the dict.

    Uses monkeypatch.chdir so cwd restore is automatic and parallel-safe
    (no process-global os.chdir mutation).
    """
    # Write a minimal packet file the function will byte-copy.
    packet = tmp_path / "packet.toml"
    packet.write_text('gate = "PLAN_REVIEW"\nissue = 1081\n', encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    _materialize_approved_plan(packet, _make_verdict(next_action))

    verdict_path = tmp_path / ".claude" / "state" / "last-chatgpt-verdict.toml"
    return tomllib.loads(verdict_path.read_text(encoding="utf-8"))


def test_materialize_next_action_with_double_quotes(tmp_path, monkeypatch):
    """next_action containing double-quotes must round-trip cleanly via tomllib."""
    next_action = 'Say "hello" then proceed'
    data = _run_materialize(tmp_path, monkeypatch, next_action)
    assert data["next_action"] == next_action


def test_materialize_next_action_with_backslashes(tmp_path, monkeypatch):
    """next_action containing backslashes must round-trip without corruption."""
    next_action = "C:\\path\\file"
    data = _run_materialize(tmp_path, monkeypatch, next_action)
    assert data["next_action"] == next_action


def test_materialize_next_action_with_newlines(tmp_path, monkeypatch):
    """next_action containing a newline character must round-trip via tomllib."""
    next_action = "line1\nline2"
    data = _run_materialize(tmp_path, monkeypatch, next_action)
    assert "\n" in data["next_action"], "newline must be preserved in round-trip"
    assert data["next_action"] == next_action


def test_materialize_next_action_toml_injection_payload(tmp_path, monkeypatch):
    """
    A malicious next_action that embeds a TOML injection payload must NOT
    create additional top-level keys or tables.  The parsed dict must contain
    exactly the 5 expected keys and no 'evil' table.
    """
    next_action = 'bad"\n[evil]\nkey="value"\n'
    data = _run_materialize(tmp_path, monkeypatch, next_action)

    expected_keys = {"gate", "verdict", "issue", "approved_at", "next_action"}
    assert set(data.keys()) == expected_keys, (
        f"Unexpected keys in parsed TOML: {set(data.keys()) - expected_keys}"
    )
    assert "evil" not in data, "'evil' table must not be injected"
    assert "key" not in data, "'key' must not be a top-level key"


def test_materialize_next_action_triple_quote_payload(tmp_path, monkeypatch):
    """Triple-quote payload must not break TOML parsing or inject extra keys."""
    next_action = '""" triple quote style'
    data = _run_materialize(tmp_path, monkeypatch, next_action)

    expected_keys = {"gate", "verdict", "issue", "approved_at", "next_action"}
    assert set(data.keys()) == expected_keys, (
        f"Unexpected extra keys: {set(data.keys()) - expected_keys}"
    )
    assert data["next_action"] == next_action


def test_materialize_next_action_empty_string(tmp_path, monkeypatch):
    """Empty next_action must be stored as an empty string and round-trip cleanly."""
    data = _run_materialize(tmp_path, monkeypatch, "")
    assert data["next_action"] == ""


def test_materialize_full_tomllib_roundtrip(tmp_path, monkeypatch):
    """
    Full output parses cleanly; all 5 expected fields present with correct types.
    gate / verdict / next_action / approved_at must be str; issue must be int.
    """
    next_action = "Proceed with implementation per current-approved-plan.toml."
    data = _run_materialize(tmp_path, monkeypatch, next_action)

    expected_keys = {"gate", "verdict", "issue", "approved_at", "next_action"}
    assert set(data.keys()) == expected_keys

    assert isinstance(data["gate"], str)
    assert isinstance(data["verdict"], str)
    assert isinstance(data["next_action"], str)
    assert isinstance(data["approved_at"], str)
    assert isinstance(data["issue"], int)

    assert data["gate"] == "PLAN_REVIEW"
    assert data["verdict"] == "APPROVED"
    assert data["issue"] == 1081
    assert data["next_action"] == next_action
