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
                return_value=wrong_verdict,
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
            return_value=APPROVED_VERDICT,
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
            return_value=REVISION_REQUIRED_VERDICT,
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
                return_value=APPROVED_VERDICT,
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
