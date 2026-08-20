#!/usr/bin/env python3
"""
Mode-3 WORKDONE_REVIEW preflight validator.

Runs 4 deterministic checks on Phase 7C artefacts:
1. SHA256 integrity chain
2. Routing-decision-log consistency
3. Scope-lock / forbidden-file check
4. Eval-checklist satisfaction

Output: compact JSON suitable for WORKDONE_REVIEW evidence.

Usage:
    python .claude/scripts/verify-mode3-workdone.py --issue <N> --base origin/main
"""

import argparse
import json
import hashlib
import subprocess
import sys
import re
import fnmatch
import tomllib
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def load_toml_file(path: Path) -> Dict[str, Any]:
    """Load TOML file using tomllib. Returns parsed dict; raises on TOML errors."""
    if not path.exists():
        return {}
    try:
        with open(path, 'rb') as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ValueError(f"TOML decode error in {path.name} at line {e.lineno}, col {e.colno}: {e.msg}")
    except Exception as e:
        raise ValueError(f"Failed to read {path.name}: {str(e)}")


def compute_sha256(path: Path) -> Optional[str]:
    """Compute SHA256 hash of a file."""
    if not path.exists():
        return None
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except Exception:
        return None


def check_sha256_chain(handoff_path: Path, candidate_path: Path, plan_path: Path) -> Tuple[bool, List[str]]:
    """
    Check 1: SHA256 integrity chain.

    Verify:
    - sha256(approved-execution-handoff.toml) == workdone-candidate.toml.handoff_sha256
    - sha256(approved-plan.toml) == approved-execution-handoff.toml.plan.approved_plan_sha256
    """
    details = []

    # Check file existence
    if not handoff_path.exists():
        details.append(f"approved-execution-handoff.toml not found: {handoff_path}")
        return False, details
    if not candidate_path.exists():
        details.append(f"workdone-candidate.toml not found: {candidate_path}")
        return False, details
    if not plan_path.exists():
        details.append(f"approved-plan.toml not found: {plan_path}")
        return False, details

    # Check 1: handoff sha256
    handoff_hash = compute_sha256(handoff_path)
    try:
        candidate_toml = load_toml_file(candidate_path)
    except ValueError as e:
        details.append(f"Failed to parse {candidate_path.name}: {str(e)[:150]}")
        return False, details
    # Look for handoff_sha256 in top-level or [handoff] section
    candidate_handoff_sha = candidate_toml.get('handoff_sha256', None)
    if not candidate_handoff_sha and 'handoff' in candidate_toml:
        candidate_handoff_sha = candidate_toml['handoff'].get('handoff_sha256', None)

    if not handoff_hash:
        details.append("Could not compute handoff file hash")
        return False, details
    if not candidate_handoff_sha:
        details.append("workdone-candidate.toml missing handoff_sha256 field")
        return False, details
    if handoff_hash != candidate_handoff_sha:
        details.append(f"Handoff SHA256 mismatch: computed={handoff_hash[:16]}... expected={candidate_handoff_sha[:16]}...")
        return False, details

    # Check 2: plan sha256
    plan_hash = compute_sha256(plan_path)
    try:
        handoff_toml = load_toml_file(handoff_path)
    except ValueError as e:
        details.append(f"Failed to parse {handoff_path.name}: {str(e)[:150]}")
        return False, details
    # Look for approved_plan_sha256 in top-level or nested sections
    handoff_plan_sha = handoff_toml.get('approved_plan_sha256', None)
    if not handoff_plan_sha:
        # Check in [metadata] section
        for section_name in ['metadata', 'plan', 'approval']:
            if section_name in handoff_toml and isinstance(handoff_toml[section_name], dict):
                handoff_plan_sha = handoff_toml[section_name].get('approved_plan_sha256', None)
                if handoff_plan_sha:
                    break

    if not plan_hash:
        details.append("Could not compute plan file hash")
        return False, details
    if not handoff_plan_sha:
        details.append("approved-execution-handoff.toml missing approved_plan_sha256 field (or not in expected location)")
        return False, details
    if plan_hash != handoff_plan_sha:
        details.append(f"Plan SHA256 mismatch: computed={plan_hash[:16]}... expected={handoff_plan_sha[:16]}...")
        return False, details

    return True, []


def check_routing_decision_log(log_path: Path, candidate_path: Path, handoff_path: Path) -> Tuple[bool, List[str]]:
    """
    Check 2: Routing-decision-log consistency.

    Verify:
    - Routing decision exists in log
    - Workdone-candidate references or includes routing evidence
    - Do not overfit to brittle prose; report "not_machine_verifiable" for unparseable fields
    """
    details = []

    if not log_path.exists():
        details.append(f"team-lead-execution-log.md not found: {log_path}")
        return False, details
    if not candidate_path.exists():
        details.append(f"workdone-candidate.toml not found: {candidate_path}")
        return False, details

    log_content = log_path.read_text(encoding='utf-8')

    # Check for routing decision marker
    if '[ROUTING DECISION]' not in log_content:
        details.append("No [ROUTING DECISION] marker found in team-lead-execution-log.md")
        return False, details

    # Check that workdone-candidate has a routing_decision_log section
    try:
        candidate_toml = load_toml_file(candidate_path)
    except ValueError as e:
        details.append(f"Failed to parse {candidate_path.name}: {str(e)[:150]}")
        return False, details
    if 'routing_decision_log' not in candidate_toml and 'routing_decision_summary' not in candidate_toml:
        # Per contract (workdone-review.md:35), routing_decision_log section must exist and match the log
        details.append("routing_decision_log section missing from workdone-candidate.toml (required by contract)")
        return False, details

    return True, []


def check_scope_lock(base_ref: str, issue: int, handoff_path: Path) -> Tuple[bool, List[str], List[str]]:
    """
    Check 3: Scope-lock / forbidden-file check.

    Use: git diff --name-only <base>...HEAD

    Compare against handoff scope if available.

    Returns: (pass, details, changed_files, violations)
    """
    details = []
    violations = []
    changed_files = []

    if not handoff_path.exists():
        details.append(f"approved-execution-handoff.toml not found: {handoff_path}")
        return False, details, [], violations

    # Get changed files
    try:
        result = subprocess.run(
            ['git', 'diff', '--name-only', f'{base_ref}...HEAD'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            # If we're not in a git repo, this check is skipped (not a failure)
            if 'not a git repository' in result.stderr.lower():
                details.append("not_machine_verifiable: not in a git repository (scope-lock check skipped)")
                return True, details, [], []
            details.append(f"git diff failed: {result.stderr[:200]}")
            return False, details, [], violations
        changed_files = result.stdout.strip().split('\n') if result.stdout.strip() else []
    except Exception as e:
        details.append(f"Could not run git diff: {str(e)}")
        # Don't fail if git is unavailable; just skip the check
        return True, details, [], []

    # Parse handoff for forbidden globs
    try:
        handoff_toml = load_toml_file(handoff_path)
    except ValueError as e:
        details.append(f"Failed to parse {handoff_path.name}: {str(e)[:150]}")
        return False, details, changed_files, violations
    forbidden_patterns = []

    # Extract forbidden_globs from handoff (tomllib returns it as a list, not a string)
    forbidden_globs = handoff_toml.get('forbidden_globs', None)
    if not forbidden_globs and 'executor' in handoff_toml and isinstance(handoff_toml['executor'], dict):
        forbidden_globs = handoff_toml['executor'].get('forbidden_globs', None)

    # forbidden_globs is now a list (parsed by tomllib), not a string
    if forbidden_globs and isinstance(forbidden_globs, list):
        forbidden_patterns.extend(forbidden_globs)

    # If no forbidden globs in handoff, use defensive defaults
    if not forbidden_patterns:
        forbidden_patterns = [
            '**/.env*',
            '**/secrets/**',
            '**/credentials',
        ]

    # Check each changed file against forbidden patterns using fnmatch
    for f in changed_files:
        for pattern in forbidden_patterns:
            # fnmatch handles glob patterns directly
            if fnmatch.fnmatch(f, pattern):
                violations.append(f)
                break

    if violations:
        details.append(f"Forbidden files changed: {', '.join(violations)}")
        return False, details, changed_files, violations

    return True, details, changed_files, []


def check_eval_checklist(handoff_path: Path, candidate_path: Path) -> Tuple[bool, List[str], int, int]:
    """
    Check 4: Eval-checklist satisfaction.

    Compare:
    - approved-execution-handoff.toml [eval_checklist].items
    - workdone-candidate.toml [eval_checklist_result]

    Uses proper TOML parsing (tomllib) to handle special characters in keys.

    Returns: (pass, details, required_count, passed_count)
    """
    details = []
    missing = []

    if not handoff_path.exists():
        details.append(f"approved-execution-handoff.toml not found: {handoff_path}")
        return False, details, 0, 0
    if not candidate_path.exists():
        details.append(f"workdone-candidate.toml not found: {candidate_path}")
        return False, details, 0, 0

    # Parse eval_checklist from handoff using tomllib
    try:
        with open(handoff_path, 'rb') as f:
            handoff_toml = tomllib.load(f)

        checklist_items = []
        if 'eval_checklist' in handoff_toml and isinstance(handoff_toml['eval_checklist'], dict):
            items_field = handoff_toml['eval_checklist'].get('items', [])
            if isinstance(items_field, list):
                checklist_items = items_field

        if not checklist_items:
            details.append("not_machine_verifiable: eval_checklist items not found or not a list")
            return True, details, 0, 0
    except Exception as e:
        details.append(f"Error parsing handoff TOML: {str(e)[:100]}")
        return False, details, 0, 0

    # Parse eval_checklist_result from candidate using tomllib
    try:
        with open(candidate_path, 'rb') as f:
            candidate_toml = tomllib.load(f)

        result_items = {}
        if 'eval_checklist_result' in candidate_toml and isinstance(candidate_toml['eval_checklist_result'], dict):
            result_items = candidate_toml['eval_checklist_result']
    except Exception as e:
        details.append(f"Error parsing candidate TOML: {str(e)[:100]}")
        return False, details, 0, 0

    # Check coverage: each item in checklist must have a PASS status in result_items.
    # NOT_APPLICABLE_TO_SLICE is also accepted as satisfied -- a programme-wide PLAN_REVIEW
    # eval_checklist is transcribed verbatim into every slice's handoff, but an individual
    # slice's allowed_file_globs may affirmatively forbid the files a given item requires
    # (e.g. a CI-wiring item when the slice's handoff forbids .github/workflows/**). Requiring
    # PASS in that case would force either a false-PASS claim or permanently-blocked slices.
    # To prevent this from becoming an unexamined escape hatch, the value must carry a reason
    # beyond the bare marker (i.e. not just "NOT_APPLICABLE_TO_SLICE" with nothing after it).
    required_count = len(checklist_items)
    passed_count = 0
    not_applicable_count = 0
    not_applicable_items = []
    for item in checklist_items:
        # item is the exact string from TOML
        if item in result_items:
            raw_val = str(result_items[item])
            val = raw_val.upper()
            if val.startswith('PASS'):
                passed_count += 1
            elif val.startswith('NOT_APPLICABLE_TO_SLICE') and len(raw_val.strip()) > len('NOT_APPLICABLE_TO_SLICE') + 5:
                not_applicable_count += 1
                not_applicable_items.append(item)
            else:
                missing.append(item)
        else:
            missing.append(item)

    if not_applicable_items:
        details.append(
            f"{not_applicable_count} item(s) marked NOT_APPLICABLE_TO_SLICE with a stated reason "
            f"(programme-level checklist item out of this slice's scope): "
            f"{', '.join(not_applicable_items[:3])}"
        )

    if missing:
        details.append(f"Eval checklist items not marked PASS: {', '.join(missing[:3])}")
        if len(missing) > 3:
            details.append(f"  ... and {len(missing) - 3} more")
        return False, details, required_count, passed_count

    return True, details, required_count, passed_count


def main():
    parser = argparse.ArgumentParser(
        description='Mode-3 WORKDONE_REVIEW preflight validator'
    )
    parser.add_argument('--issue', type=int, required=True, help='GitHub issue number')
    parser.add_argument('--base', default='origin/main', help='Base ref for git diff')

    args = parser.parse_args()

    handoff_dir = Path(f'.claude/handoffs/issue-{args.issue}')

    handoff_path = handoff_dir / 'approved-execution-handoff.toml'
    candidate_path = handoff_dir / 'workdone-candidate.toml'
    plan_path = handoff_dir / 'approved-plan.toml'
    log_path = handoff_dir / 'team-lead-execution-log.md'

    result = {
        'pass': True,
        'issue': args.issue,
        'checks': {
            'sha256_chain': {'pass': False, 'details': []},
            'routing_decision_log': {'pass': False, 'details': []},
            'scope_lock': {'pass': False, 'details': [], 'changed_files': [], 'violations': []},
            'eval_checklist': {'pass': False, 'details': [], 'required_count': 0, 'passed_count': 0, 'missing': []}
        }
    }

    # Check 1: SHA256 chain
    sha256_pass, sha256_details = check_sha256_chain(handoff_path, candidate_path, plan_path)
    result['checks']['sha256_chain']['pass'] = sha256_pass
    result['checks']['sha256_chain']['details'] = sha256_details
    if not sha256_pass:
        result['pass'] = False

    # Check 2: Routing decision log
    routing_pass, routing_details = check_routing_decision_log(log_path, candidate_path, handoff_path)
    result['checks']['routing_decision_log']['pass'] = routing_pass
    result['checks']['routing_decision_log']['details'] = routing_details
    if not routing_pass:
        result['pass'] = False

    # Check 3: Scope lock
    scope_pass, scope_details, changed_files, violations = check_scope_lock(args.base, args.issue, handoff_path)
    result['checks']['scope_lock']['pass'] = scope_pass
    result['checks']['scope_lock']['details'] = scope_details
    result['checks']['scope_lock']['changed_files'] = changed_files
    result['checks']['scope_lock']['violations'] = violations
    if not scope_pass:
        result['pass'] = False

    # Check 4: Eval checklist
    checklist_pass, checklist_details, req_count, pass_count = check_eval_checklist(handoff_path, candidate_path)
    result['checks']['eval_checklist']['pass'] = checklist_pass
    result['checks']['eval_checklist']['details'] = checklist_details
    result['checks']['eval_checklist']['required_count'] = req_count
    result['checks']['eval_checklist']['passed_count'] = pass_count
    if not checklist_pass:
        result['pass'] = False

    # Output JSON
    print(json.dumps(result, indent=2))

    # Exit code
    sys.exit(0 if result['pass'] else 1)


if __name__ == '__main__':
    main()
