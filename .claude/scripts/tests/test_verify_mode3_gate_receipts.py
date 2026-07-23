#!/usr/bin/env python3
"""
Tests for verify-mode3-gate-receipts.py (#1961).

Each RUNTIME test is a positive control: it must be OBSERVED failing
(exit 1) on the bad-input fixture, and the corresponding happy path (or
the specific check id under test) must pass on good input. This locks
the gate-receipt reconciliation contract introduced after the old
`mandatory_gates_satisfied` aggregate boolean was found to be an
unverifiable self-report.

Coverage:
 1. happy_path                              — full roster satisfied, exit 0
 2. missing_receipt                          — receipt_present fails
 3. duplicate_receipt                        — receipt_no_duplicate fails
 4. stale_run                                — receipt_run_match fails
 5. receipt_integrity_tamper                 — receipt_integrity fails
 6. disallowed_verdict (FAIL / NOT_REQUIRED w/ empty skip_rule) — receipt_verdict_allowed fails
 7. transcript_missing                       — transcript_bound fails
 8. transcript_trivial                       — transcript_bound fails
 9. transcript_digest_mismatch               — transcript_bound fails
10. verdict_mismatch                         — verdict_matches_transcript fails
11. reviewed_commit_stale_within_coverage    — reviewed_commit_fresh fails (git fixture)
12. reviewed_commit_fresh_outside_coverage   — reviewed_commit_fresh passes (git fixture)
13. reviewed_commit_unresolvable             — reviewed_commit_fresh fails, fail-closed (git fixture)
14. bootstrap_mode                          — missing receipt exit 0, mode=bootstrap; corrupt receipt still fails
15. docs_only invariant                     — real worktree docs satisfy the static checks
16. gate_field_mismatch                     — receipt_gate_identity fails (copied/renamed receipt exploit, #1961)
17. evidence_path_reused                    — evidence_path_unique fails (shared-transcript exploit, #1961)
"""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / ".claude" / "scripts" / "verify-mode3-gate-receipts.py"

ISSUE = 8801
DUMMY_COMMIT = "0" * 40


# --------------------------------------------------------------------------- #
# Fixture builders
# --------------------------------------------------------------------------- #

def toml_str(s: str) -> str:
    return json.dumps(s)


def write_handoff(handoff_dir: Path, mandatory_gates, receipts_contract=1):
    handoff_dir.mkdir(parents=True, exist_ok=True)
    lines = [
        "[executor]",
        "",
        "[executor.specialist_policy]",
        "mandatory_gates = [" + ", ".join(toml_str(g) for g in mandatory_gates) + "]",
    ]
    if receipts_contract is not None:
        lines.append(f"receipts_contract = {receipts_contract}")
    (handoff_dir / "approved-execution-handoff.toml").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def render_receipt(fields: dict) -> str:
    lines = [
        f"schema_version = {fields.get('schema_version', 1)}",
        f"issue = {fields['issue']}",
        f"run_id = {toml_str(fields['run_id'])}",
        f"gate = {toml_str(fields['gate'])}",
        f"task_id = {toml_str(fields.get('task_id', 'T3'))}",
        f"agent = {toml_str(fields.get('agent', fields['gate']))}",
        'started_at = "2026-01-01T00:00:00Z"',
        'completed_at = "2026-01-01T00:00:00Z"',
        f"verdict = {toml_str(fields['verdict'])}",
        f"skip_rule = {toml_str(fields.get('skip_rule', ''))}",
        f"reviewed_commit = {toml_str(fields['reviewed_commit'])}",
        "coverage_globs = ["
        + ", ".join(toml_str(g) for g in fields.get("coverage_globs", []))
        + "]",
        f"evidence_path = {toml_str(fields['evidence_path'])}",
        f"transcript_sha256 = {toml_str(fields['transcript_sha256'])}",
        'receipt_sha256 = ""',
    ]
    return "\n".join(lines) + "\n"


def write_receipt(path: Path, fields: dict) -> str:
    """Writes a gate receipt with a CORRECT self-excluded receipt_sha256,
    using the exact algorithm documented in gate-receipt.toml / implemented
    by compute_receipt_self_excluded_sha256 in the verifier."""
    placeholder_text = render_receipt(fields)
    digest = hashlib.sha256(placeholder_text.encode("utf-8")).hexdigest()
    final_text = placeholder_text.replace(
        'receipt_sha256 = ""', f'receipt_sha256 = "{digest}"'
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(final_text, encoding="utf-8")
    return final_text


def write_transcript(path: Path, verdict: str, body: str = None) -> str:
    if body is None:
        body = "Reviewed the change thoroughly across all files and it looks acceptable overall."
    path.parent.mkdir(parents=True, exist_ok=True)
    text = f"{body}\n\nFINAL_VERDICT: {verdict}\n"
    path.write_text(text, encoding="utf-8")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def default_receipt_fields(gate: str, evidence_path: str, transcript_sha: str,
                            verdict: str = "APPROVE", **overrides) -> dict:
    fields = {
        "issue": ISSUE,
        "run_id": f"issue-{ISSUE}",
        "gate": gate,
        "verdict": verdict,
        "reviewed_commit": DUMMY_COMMIT,
        "coverage_globs": ["src/**"],
        "evidence_path": evidence_path,
        "transcript_sha256": transcript_sha,
    }
    fields.update(overrides)
    return fields


def run_script(cwd: Path, extra_args=None, docs_only=False):
    cmd = [sys.executable, str(SCRIPT), "--issue", str(ISSUE), "--json"]
    if docs_only:
        cmd.append("--docs-only")
    else:
        cmd.append("--receipts-only")
    if extra_args:
        cmd += extra_args
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(cwd), timeout=30)
    out = json.loads(r.stdout) if r.stdout.strip() else {}
    return r.returncode, out, r.stderr


def git(cwd: Path, *args):
    r = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=20)
    assert r.returncode == 0, f"git {args} failed: {r.stderr}"
    return r.stdout.strip()


def init_git_repo(root: Path):
    git(root, "init", "-q")
    git(root, "config", "user.email", "test@example.com")
    git(root, "config", "user.name", "Test")


def gate_status(out: dict, gate: str):
    for g in out.get("gate_evidence", []):
        if g["gate"] == gate:
            return g
    return None


# --------------------------------------------------------------------------- #
# 1. happy_path
# --------------------------------------------------------------------------- #

def test_happy_path(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["qa-fast", "code-reviewer"], receipts_contract=1)

    for gate in ["qa-fast", "code-reviewer"]:
        transcript_path = handoff_dir / "transcripts" / f"{gate}-T3.md"
        tsha = write_transcript(transcript_path, "APPROVE")
        fields = default_receipt_fields(
            gate, f".claude/handoffs/issue-{ISSUE}/transcripts/{gate}-T3.md", tsha
        )
        write_receipt(handoff_dir / "gates" / f"{gate}.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 0, f"expected pass, got failed={out.get('failed')} stderr={err}"
    assert out["pass"] is True
    assert out["mode"] == "enforce"
    assert out["receipts_bootstrap"] is False
    assert len(out["gate_evidence"]) == 2
    for g in out["gate_evidence"]:
        assert g["status"] == "SATISFIED", g


# --------------------------------------------------------------------------- #
# 2. missing_receipt
# --------------------------------------------------------------------------- #

def test_missing_receipt(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["qa-fast", "code-reviewer"], receipts_contract=1)

    # Only qa-fast gets a receipt; code-reviewer (mandatory) has none.
    transcript_path = handoff_dir / "transcripts" / "qa-fast-T3.md"
    tsha = write_transcript(transcript_path, "APPROVE")
    fields = default_receipt_fields(
        "qa-fast", f".claude/handoffs/issue-{ISSUE}/transcripts/qa-fast-T3.md", tsha
    )
    write_receipt(handoff_dir / "gates" / "qa-fast.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert out["pass"] is False
    assert checks_failed(out, "receipt_present")
    missing = gate_status(out, "code-reviewer")
    assert missing is not None and missing["status"] == "MISSING"


def checks_failed(out: dict, check_id: str) -> bool:
    return check_id in out.get("checks", {}) and out["checks"][check_id]["pass"] is False


# --------------------------------------------------------------------------- #
# 3. duplicate_receipt
# --------------------------------------------------------------------------- #

def test_duplicate_receipt(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    tsha = write_transcript(transcript_path, "APPROVE")
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha
    )
    # Two files that both parse to (gate='code-reviewer', level=0).
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)
    write_receipt(handoff_dir / "gates" / "code-reviewer-r0.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "receipt_no_duplicate")
    assert any("duplicate" in f for f in out["failed"])


# --------------------------------------------------------------------------- #
# 4. stale_run
# --------------------------------------------------------------------------- #

def test_stale_run(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    tsha = write_transcript(transcript_path, "APPROVE")
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha,
        run_id=f"issue-{ISSUE + 1}",  # mismatched run_id -> stale/cross-run receipt
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "receipt_run_match")


# --------------------------------------------------------------------------- #
# 5. receipt_integrity_tamper
# --------------------------------------------------------------------------- #

def test_receipt_integrity_tamper(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    tsha = write_transcript(transcript_path, "APPROVE")
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha
    )
    receipt_path = handoff_dir / "gates" / "code-reviewer.toml"
    write_receipt(receipt_path, fields)

    # Hand-edit a field AFTER the sha256 was computed and stored, without
    # recomputing receipt_sha256 -> integrity check must catch this.
    text = receipt_path.read_text(encoding="utf-8")
    text = text.replace(
        f'reviewed_commit = "{DUMMY_COMMIT}"',
        'reviewed_commit = "' + ("1" * 40) + '"',
    )
    receipt_path.write_text(text, encoding="utf-8")

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "receipt_integrity")


# --------------------------------------------------------------------------- #
# 6. disallowed_verdict (two sub-cases)
# --------------------------------------------------------------------------- #

def test_disallowed_verdict_fail(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    tsha = write_transcript(transcript_path, "FAIL")
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha,
        verdict="FAIL",
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "receipt_verdict_allowed")


def test_disallowed_verdict_not_required_without_skip_rule(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    tsha = write_transcript(transcript_path, "NOT_REQUIRED")
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha,
        verdict="NOT_REQUIRED", skip_rule="",
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "receipt_verdict_allowed")
    assert any("skip_rule" in f for f in out["failed"])


# --------------------------------------------------------------------------- #
# 7. transcript_missing
# --------------------------------------------------------------------------- #

def test_transcript_missing(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    fields = default_receipt_fields(
        "code-reviewer",
        f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md",
        "0" * 64,  # arbitrary expected sha; file won't exist at all
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)
    # Deliberately do NOT create the transcript file.

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "transcript_bound")
    assert any("transcript_missing" in f for f in out["failed"])


# --------------------------------------------------------------------------- #
# 8. transcript_trivial
# --------------------------------------------------------------------------- #

def test_transcript_trivial(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    # Has a FINAL_VERDICT line, but total non-whitespace content is < 40 chars.
    tsha = write_transcript(transcript_path, "APPROVE", body="ok")
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "transcript_bound")
    assert any("transcript_trivial" in f for f in out["failed"])


# --------------------------------------------------------------------------- #
# 9. transcript_digest_mismatch
# --------------------------------------------------------------------------- #

def test_transcript_digest_mismatch(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    tsha = write_transcript(transcript_path, "APPROVE")
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    # Edit the transcript AFTER the receipt was written, so the on-disk
    # transcript no longer matches the receipt's stored transcript_sha256.
    transcript_path.write_text(
        transcript_path.read_text(encoding="utf-8") + "\nEdited after receipt was written.\n",
        encoding="utf-8",
    )

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "transcript_bound")
    assert any("transcript_digest_mismatch" in f for f in out["failed"])


# --------------------------------------------------------------------------- #
# 10. verdict_mismatch
# --------------------------------------------------------------------------- #

def test_verdict_mismatch(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)

    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    # Transcript's authoritative FINAL_VERDICT is NEEDS_FIXES...
    tsha = write_transcript(transcript_path, "NEEDS_FIXES")
    # ...but the receipt claims APPROVE.
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha,
        verdict="APPROVE",
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "verdict_matches_transcript")
    assert any("receipt.verdict='APPROVE'" in f or "APPROVE" in f for f in out["failed"]
               if "verdict_matches_transcript" in f)


# --------------------------------------------------------------------------- #
# 11-13. reviewed_commit_fresh (git fixtures)
# --------------------------------------------------------------------------- #

def _prep_git_receipt(tmp_path, coverage_globs, verdict="APPROVE"):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["code-reviewer"], receipts_contract=1)
    transcript_path = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    tsha = write_transcript(transcript_path, verdict)
    return handoff_dir, transcript_path, tsha


def test_reviewed_commit_stale_within_coverage(tmp_path):
    init_git_repo(tmp_path)
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "foo.py").write_text("print(1)\n", encoding="utf-8")
    git(tmp_path, "add", "src/foo.py")
    git(tmp_path, "commit", "-q", "-m", "initial")
    reviewed_commit = git(tmp_path, "rev-parse", "HEAD")

    handoff_dir, transcript_path, tsha = _prep_git_receipt(tmp_path, ["src/**"])
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha,
        reviewed_commit=reviewed_commit, coverage_globs=["src/**"],
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    # A LATER commit touches a file INSIDE coverage_globs -> stales the gate.
    (tmp_path / "src" / "foo.py").write_text("print(2)\n", encoding="utf-8")
    git(tmp_path, "add", "src/foo.py")
    git(tmp_path, "commit", "-q", "-m", "covered change after review")

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert checks_failed(out, "reviewed_commit_fresh")
    g = gate_status(out, "code-reviewer")
    assert g is not None and g["status"] == "STALE"


def test_reviewed_commit_fresh_outside_coverage(tmp_path):
    init_git_repo(tmp_path)
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "foo.py").write_text("print(1)\n", encoding="utf-8")
    git(tmp_path, "add", "src/foo.py")
    git(tmp_path, "commit", "-q", "-m", "initial")
    reviewed_commit = git(tmp_path, "rev-parse", "HEAD")

    handoff_dir, transcript_path, tsha = _prep_git_receipt(tmp_path, ["src/**"])
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha,
        reviewed_commit=reviewed_commit, coverage_globs=["src/**"],
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    # A LATER commit touches a file OUTSIDE coverage_globs -> must NOT stale.
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "readme.md").write_text("notes\n", encoding="utf-8")
    git(tmp_path, "add", "docs/readme.md")
    git(tmp_path, "commit", "-q", "-m", "uncovered change after review")

    rc, out, err = run_script(tmp_path)
    assert rc == 0, f"expected pass (out-of-coverage commit must not stale), got {out}"
    assert not checks_failed(out, "reviewed_commit_fresh")
    g = gate_status(out, "code-reviewer")
    assert g is not None and g["status"] == "SATISFIED" and g["stale"] is False


def test_reviewed_commit_unresolvable(tmp_path):
    init_git_repo(tmp_path)
    (tmp_path / "README.md").write_text("hello\n", encoding="utf-8")
    git(tmp_path, "add", "README.md")
    git(tmp_path, "commit", "-q", "-m", "initial")

    handoff_dir, transcript_path, tsha = _prep_git_receipt(tmp_path, ["src/**"])
    bogus_commit = "d" * 40  # well-formed sha, but does not exist in this repo
    fields = default_receipt_fields(
        "code-reviewer", f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", tsha,
        reviewed_commit=bogus_commit, coverage_globs=["src/**"],
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected fail-closed on unresolvable commit, got {out}"
    assert checks_failed(out, "reviewed_commit_fresh")
    assert any("reviewed_commit_unresolvable" in f for f in out["failed"])


# --------------------------------------------------------------------------- #
# 14. bootstrap_mode
# --------------------------------------------------------------------------- #

def test_bootstrap_mode_missing_receipt_downgrades_visibly(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    # No receipts_contract field at all -> bootstrap mode. No gates/ dir either.
    write_handoff(handoff_dir, ["qa-fast"], receipts_contract=None)

    rc, out, err = run_script(tmp_path)
    assert rc == 0, f"expected bootstrap pass, got {out}"
    assert out["mode"] == "bootstrap"
    assert out["receipts_bootstrap"] is True
    g = gate_status(out, "qa-fast")
    assert g is not None and g["status"] == "MISSING"
    # Visible downgrade: the missing-receipt detail must still be reported,
    # not silently dropped, even though it doesn't fail the run.
    assert "receipt_present" in out["checks"]
    assert out["checks"]["receipt_present"]["pass"] is True
    assert any("bootstrap mode" in d for d in out["checks"]["receipt_present"]["details"])


def test_bootstrap_mode_corrupt_receipt_still_fails(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["qa-fast"], receipts_contract=None)  # bootstrap mode

    transcript_path = handoff_dir / "transcripts" / "qa-fast-T3.md"
    tsha = write_transcript(transcript_path, "APPROVE")
    fields = default_receipt_fields(
        "qa-fast", f".claude/handoffs/issue-{ISSUE}/transcripts/qa-fast-T3.md", tsha
    )
    receipt_path = handoff_dir / "gates" / "qa-fast.toml"
    write_receipt(receipt_path, fields)
    # Corrupt AFTER writing, without recomputing receipt_sha256.
    text = receipt_path.read_text(encoding="utf-8")
    text = text.replace('verdict = "APPROVE"', 'verdict = "APPROVE"  # tampered comment')
    receipt_path.write_text(text, encoding="utf-8")

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"bootstrap mode must still enforce integrity on a PRESENT receipt, got {out}"
    assert out["mode"] == "bootstrap"
    assert out["receipts_bootstrap"] is True
    assert checks_failed(out, "receipt_integrity")


# --------------------------------------------------------------------------- #
# 16. gate_field_mismatch (#1961 exploit: copied/renamed receipt)
# --------------------------------------------------------------------------- #

def test_gate_field_mismatch_rejected(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["qa-fast", "code-reviewer"], receipts_contract=1)

    # qa-fast: fully valid, correctly self-identified receipt.
    qa_transcript = handoff_dir / "transcripts" / "qa-fast-T3.md"
    qa_tsha = write_transcript(qa_transcript, "APPROVE")
    qa_fields = default_receipt_fields(
        "qa-fast", f".claude/handoffs/issue-{ISSUE}/transcripts/qa-fast-T3.md", qa_tsha
    )
    write_receipt(handoff_dir / "gates" / "qa-fast.toml", qa_fields)

    # code-reviewer: otherwise fully valid receipt (own transcript, own
    # evidence_path, correct self-excluded receipt_sha256) EXCEPT the
    # internal `gate` field says "qa-fast" -- mimicking a receipt that was
    # copied from a different gate's receipt and renamed to the
    # code-reviewer.toml filename slot, with its contents left intact
    # (so receipt_sha256 stays internally consistent). Without the
    # receipt_gate_identity check, this would silently satisfy the
    # code-reviewer mandatory gate even though code-reviewer never ran.
    cr_transcript = handoff_dir / "transcripts" / "code-reviewer-T3.md"
    cr_tsha = write_transcript(cr_transcript, "APPROVE")
    cr_fields = default_receipt_fields(
        "qa-fast",  # mismatched: filename implies "code-reviewer"
        f".claude/handoffs/issue-{ISSUE}/transcripts/code-reviewer-T3.md", cr_tsha,
    )
    write_receipt(handoff_dir / "gates" / "code-reviewer.toml", cr_fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert out["pass"] is False
    assert checks_failed(out, "receipt_gate_identity")
    assert any("gate_identity_mismatch" in f for f in out["failed"])
    g = gate_status(out, "code-reviewer")
    assert g is not None and g["status"] == "INVALID"
    # qa-fast, reconciled correctly, must remain unaffected.
    g_qa = gate_status(out, "qa-fast")
    assert g_qa is not None and g_qa["status"] == "SATISFIED"


# --------------------------------------------------------------------------- #
# 17. evidence_path_reused (#1961 exploit: shared transcript across gates)
# --------------------------------------------------------------------------- #

def test_evidence_path_reused_rejected(tmp_path):
    handoff_dir = tmp_path / ".claude" / "handoffs" / f"issue-{ISSUE}"
    write_handoff(handoff_dir, ["qa-fast", "code-reviewer"], receipts_contract=1)

    # A single transcript file, otherwise perfectly valid, cited by BOTH
    # mandatory gates' receipts. Without evidence_path_unique, one real
    # review could satisfy two distinct mandatory gates.
    shared_transcript = handoff_dir / "transcripts" / "shared-T3.md"
    shared_tsha = write_transcript(shared_transcript, "APPROVE")
    shared_evidence_path = f".claude/handoffs/issue-{ISSUE}/transcripts/shared-T3.md"

    for gate in ["qa-fast", "code-reviewer"]:
        fields = default_receipt_fields(gate, shared_evidence_path, shared_tsha)
        write_receipt(handoff_dir / "gates" / f"{gate}.toml", fields)

    rc, out, err = run_script(tmp_path)
    assert rc == 1, f"expected failure, got {out}"
    assert out["pass"] is False
    assert checks_failed(out, "evidence_path_unique")
    assert any("evidence_path_reused" in f for f in out["failed"])
    statuses = {g["gate"]: g["status"] for g in out["gate_evidence"]}
    assert "INVALID" in statuses.values(), statuses


# --------------------------------------------------------------------------- #
# 15. docs_only invariant (real worktree docs)
# --------------------------------------------------------------------------- #

def test_docs_only_invariant_on_real_worktree():
    rc, out, err = run_script(REPO, docs_only=True)
    assert rc == 0, f"expected real worktree docs to satisfy static invariants, got {out} stderr={err}"
    assert out["pass"] is True
    assert out["docs"]["passed"] is True
    assert out["failed"] == []


if __name__ == "__main__":
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
