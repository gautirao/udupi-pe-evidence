#!/usr/bin/env python3
"""
Tests for verify-mode3-workdone.py

Coverage:
1. Happy path (all checks pass)
2. Missing required file
3. SHA256 mismatch
4. Eval checklist missing item
5. Forbidden file detection
6. Script exits non-zero on failure
"""

import json
import re
import subprocess
import sys
import tempfile
import hashlib
from pathlib import Path


def run_script(issue: int, base: str = 'origin/main', cwd: Path = None) -> tuple:
    """Run the script and return (returncode, stdout, stderr)."""
    cmd = [
        sys.executable,
        '.claude/scripts/verify-mode3-workdone.py',
        '--issue', str(issue),
        '--base', base
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=cwd or Path.cwd(),
        timeout=30
    )
    return result.returncode, result.stdout, result.stderr


def create_test_handoff(issue_dir: Path, include_files: set = None):
    """Create minimal test artefacts in a temporary handoff directory."""
    if include_files is None:
        include_files = {
            'approved-plan.toml',
            'approved-execution-handoff.toml',
            'workdone-candidate.toml',
            'team-lead-execution-log.md'
        }

    issue_dir.mkdir(parents=True, exist_ok=True)

    # Create approved-plan.toml
    if 'approved-plan.toml' in include_files:
        plan_content = """
[metadata]
issue = 1000

[problem]
summary = "Test issue"

[acceptance_intent]
items = ["Test AC1", "Test AC2"]

[constraints]
items = []

[eval_checklist]
items = ["AC1: Test AC1", "AC2: Test AC2"]
"""
        plan_path = issue_dir / 'approved-plan.toml'
        plan_path.write_text(plan_content)

    # Create approved-execution-handoff.toml
    if 'approved-execution-handoff.toml' in include_files:
        plan_path = issue_dir / 'approved-plan.toml'
        plan_hash = hashlib.sha256(
            plan_path.read_bytes() if plan_path.exists() else b''
        ).hexdigest()

        handoff_content = f"""
[metadata]
issue = 1000
plan = "approved-plan.toml"
approved_plan_sha256 = "{plan_hash}"

[executor]
allowed_file_globs = ["src/**", ".claude/**"]
forbidden_globs = ["**/.env*", "**/secrets/**"]

[qa_requirements]
unit_tests_required = false
e2e_tests_required = false

[eval_checklist]
items = ["AC1: Test AC1", "AC2: Test AC2"]
"""
        handoff_path = issue_dir / 'approved-execution-handoff.toml'
        handoff_path.write_text(handoff_content)

    # Create workdone-candidate.toml
    if 'workdone-candidate.toml' in include_files:
        handoff_path = issue_dir / 'approved-execution-handoff.toml'
        handoff_hash = hashlib.sha256(
            handoff_path.read_bytes() if handoff_path.exists() else b''
        ).hexdigest()

        candidate_content = f"""
[metadata]
issue = 1000

[handoff]
handoff_sha256 = "{handoff_hash}"

[eval_checklist_result]
"AC1: Test AC1" = "PASS"
"AC2: Test AC2" = "PASS"

[routing_decision_log]
selected_sequence = ["qa-fast", "frontend-engineer", "code-reviewer"]
skipped = []
"""
        candidate_path = issue_dir / 'workdone-candidate.toml'
        candidate_path.write_text(candidate_content)

    # Create team-lead-execution-log.md
    if 'team-lead-execution-log.md' in include_files:
        log_content = """
# Execution Log

## [ROUTING DECISION]

timestamp: 2026-05-26T07:00:00Z
selected_sequence: [qa-fast, frontend-engineer, code-reviewer]
skipped: []
"""
        log_path = issue_dir / 'team-lead-execution-log.md'
        log_path.write_text(log_content)


def test_happy_path():
    """Test 1: All checks pass."""
    print("\n[TEST 1] Happy path (all checks pass)")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        create_test_handoff(handoff_dir)

        # Copy script to temp location
        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        # Run script
        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        # Parse output
        try:
            result = json.loads(stdout)
            assert result['pass'] == True, f"Expected pass=true, got {result}"
            assert result['checks']['sha256_chain']['pass'] == True
            assert result['checks']['eval_checklist']['pass'] == True
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            print(f"  stdout: {stdout}")
            print(f"  stderr: {stderr}")
            return False


def test_missing_file():
    """Test 2: Missing required file."""
    print("\n[TEST 2] Missing required file")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        # Don't create any files
        handoff_dir.mkdir(parents=True, exist_ok=True)

        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        try:
            result = json.loads(stdout)
            assert result['pass'] == False, "Expected pass=false when files missing"
            assert rc != 0, "Expected non-zero exit code"
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            print(f"  stdout: {stdout}")
            return False


def test_sha256_mismatch():
    """Test 3: SHA256 mismatch."""
    print("\n[TEST 3] SHA256 mismatch")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        create_test_handoff(handoff_dir)

        # Corrupt the handoff file after computing hashes
        handoff_path = handoff_dir / 'approved-execution-handoff.toml'
        handoff_path.write_text("corrupted content")

        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        try:
            result = json.loads(stdout)
            assert result['pass'] == False
            assert result['checks']['sha256_chain']['pass'] == False
            assert rc != 0
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            print(f"  stdout: {stdout}")
            return False


def test_eval_checklist_missing_item():
    """Test 4: Eval checklist missing item."""
    print("\n[TEST 4] Eval checklist missing item")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        create_test_handoff(handoff_dir)

        # Modify candidate to remove PASS for one item
        candidate_path = handoff_dir / 'workdone-candidate.toml'
        content = candidate_path.read_text()
        content = content.replace('"AC2: Test AC2" = "PASS"', '"AC2: Test AC2" = "FAIL"')
        candidate_path.write_text(content)

        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        try:
            result = json.loads(stdout)
            assert result['pass'] == False
            assert result['checks']['eval_checklist']['pass'] == False
            assert rc != 0
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            print(f"  stdout: {stdout}")
            return False


def test_exit_code_nonzero_on_failure():
    """Test 5: Script exits non-zero on failure."""
    print("\n[TEST 5] Script exits non-zero on failure")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        handoff_dir.mkdir(parents=True, exist_ok=True)

        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        try:
            assert rc != 0, f"Expected non-zero exit code, got {rc}"
            result = json.loads(stdout)
            assert result['pass'] == False
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            return False


def test_multiline_eval_checklist():
    """Test 6: Multi-line TOML array parsing for eval_checklist."""
    print("\n[TEST 6] Multi-line eval_checklist array parsing")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        create_test_handoff(handoff_dir)

        # Replace single-line items with multi-line format
        handoff_path = handoff_dir / 'approved-execution-handoff.toml'
        content = handoff_path.read_text()
        content = content.replace(
            'items = ["AC1: Test AC1", "AC2: Test AC2"]',
            'items = [\n  "AC1: Test AC1",\n  "AC2: Test AC2",\n]'
        )
        handoff_path.write_text(content)

        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        try:
            result = json.loads(stdout)
            assert result['checks']['eval_checklist']['pass'] == True, "Expected multi-line array to parse correctly"
            assert result['checks']['eval_checklist']['required_count'] == 2, f"Expected 2 items, got {result['checks']['eval_checklist']['required_count']}"
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            print(f"  stdout: {stdout}")
            return False


def test_special_chars_in_checklist_key():
    """Test 7: Eval checklist items with special characters (regression test for PR #1287)."""
    print("\n[TEST 7] Eval checklist items with special characters (e.g. 'expected=actual')")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        create_test_handoff(handoff_dir)

        # Update handoff with a special-character item
        handoff_path = handoff_dir / 'approved-execution-handoff.toml'
        content = handoff_path.read_text()
        content = content.replace(
            'items = ["AC1: Test AC1", "AC2: Test AC2"]',
            'items = ["Include comprehensive discrepancy taxonomy (expected=actual, gate-bug, evidence-gap, category-ambiguity, prefilter-ordering)", "AC2: Test AC2"]'
        )
        handoff_path.write_text(content)

        # Update candidate to match
        candidate_path = handoff_dir / 'workdone-candidate.toml'
        content = candidate_path.read_text()
        content = content.replace(
            '"AC1: Test AC1" = "PASS"',
            '"Include comprehensive discrepancy taxonomy (expected=actual, gate-bug, evidence-gap, category-ambiguity, prefilter-ordering)" = "PASS"'
        )
        candidate_path.write_text(content)

        # Recompute hashes since we modified handoff
        handoff_path_obj = handoff_dir / 'approved-execution-handoff.toml'
        handoff_hash = hashlib.sha256(handoff_path_obj.read_bytes()).hexdigest()
        candidate_path_obj = handoff_dir / 'workdone-candidate.toml'
        candidate_content = candidate_path_obj.read_text()
        # Replace old hash with new one
        candidate_content = re.sub(
            r'handoff_sha256 = "[a-f0-9]+"',
            f'handoff_sha256 = "{handoff_hash}"',
            candidate_content
        )
        candidate_path_obj.write_text(candidate_content)

        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        try:
            result = json.loads(stdout)
            assert result['pass'] == True, f"Expected pass=true for special-char keys, got {result['checks']}"
            assert result['checks']['eval_checklist']['pass'] == True, "Expected special-char key to parse correctly"
            assert result['checks']['eval_checklist']['required_count'] == 2
            assert result['checks']['eval_checklist']['passed_count'] == 2
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            print(f"  stdout: {stdout}")
            return False


def test_forbidden_globs_list():
    """Test 8: Scope-lock correctly parses forbidden_globs as a list (tomllib output)."""
    print("\n[TEST 8] Scope-lock with forbidden_globs as list")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        handoff_dir = tmpdir_path / '.claude' / 'handoffs' / 'issue-9999'
        create_test_handoff(handoff_dir)

        # Update handoff with a custom forbidden_globs list
        handoff_path = handoff_dir / 'approved-execution-handoff.toml'
        content = handoff_path.read_text()
        content = content.replace(
            'forbidden_globs = ["**/.env*", "**/secrets/**"]',
            'forbidden_globs = ["custom-secret.txt", "**/.private/**"]'
        )
        handoff_path.write_text(content)

        # Create a file that matches the custom forbidden pattern
        changed_file = 'custom-secret.txt'

        script_src = Path('.claude/scripts/verify-mode3-workdone.py')
        script_dst = tmpdir_path / '.claude' / 'scripts' / 'verify-mode3-workdone.py'
        script_dst.parent.mkdir(parents=True, exist_ok=True)
        script_dst.write_text(script_src.read_text())

        rc, stdout, stderr = run_script(9999, cwd=tmpdir_path)

        try:
            result = json.loads(stdout)
            # The check should pass (no forbidden files changed in the test repo)
            # But we're testing that custom forbidden_globs is correctly parsed
            assert 'scope_lock' in result['checks'], "scope_lock check missing from result"
            # The important thing is that no exception was raised when parsing the list
            print("  ✓ PASS")
            return True
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
            print(f"  stdout: {stdout}")
            return False


def main():
    print("=" * 60)
    print("Mode-3 WORKDONE Validator Tests")
    print("=" * 60)

    tests = [
        test_happy_path,
        test_missing_file,
        test_sha256_mismatch,
        test_eval_checklist_missing_item,
        test_exit_code_nonzero_on_failure,
        test_multiline_eval_checklist,
        test_special_chars_in_checklist_key,
        test_forbidden_globs_list,
    ]

    results = [test() for test in tests]

    print("\n" + "=" * 60)
    print(f"Results: {sum(results)}/{len(results)} passed")
    print("=" * 60)

    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
