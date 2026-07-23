#!/usr/bin/env python3
"""
Mode-3 gate-receipt reconciliation verifier.

Two independent guarantees, mirroring the dual-structure pattern used by
verify-mode3-duplicate-run-guard.py:

A) STATIC doc-invariant checks — the Mode-3 workflow docs still document the
   gate-receipt mechanism introduced for #1961 (after the old aggregate
   `mandatory_gates_satisfied` boolean was found to be an unverifiable
   self-report): workdone-review.md runs this script as a preflight BEFORE
   verify-mode3-workdone.py; workdone-candidate.toml's template carries a
   per-gate `gate_evidence` table instead of the old aggregate boolean; and
   gate-receipt.toml exists with the required schema fields.

B) RUNTIME reconciliation — for a given --issue, left-joins the roster of
   `[executor.specialist_policy].mandatory_gates` (from
   approved-execution-handoff.toml) onto the authoritative receipt for each
   gate (.claude/handoffs/issue-<N>/gates/<gate>.toml, or the highest
   `-r<n>` rework re-run of it), and verifies:
     - every mandatory gate has a receipt (else MISSING),
     - no duplicate receipts at the same rework level,
     - the receipt matches this run (issue + run_id),
     - the receipt's own self-excluded sha256 is intact (no hand-edit/copy),
     - the verdict is one of the allowed enum values, and satisfies the gate
       only when APPROVE/PASS/NOT_REQUIRED (NOT_REQUIRED requires skip_rule),
     - the cited transcript exists, is bound by sha256, is non-trivial, and
       carries a FINAL_VERDICT line matching the receipt's verdict,
     - the reviewed_commit is still fresh relative to HEAD given the
       receipt's coverage_globs (a later commit outside coverage does not
       stale the gate; conservative fallback when coverage_globs is absent).

`receipts_contract` (int) on the handoff's specialist_policy gates enforcement
mode ("enforce"); its absence is a VISIBLE downgrade to "bootstrap" mode
(receipts_bootstrap=true in the output) where a MISSING receipt does not fail
the run, but a PRESENT-but-invalid receipt still fails loudly in either mode.

Output: JSON (pretty by default; --json for compact). Exit 0 = pass.

Usage:
    python .claude/scripts/verify-mode3-gate-receipts.py --issue <N> \
        [--base origin/main] [--json] [--receipts-only] [--docs-only]
"""

import argparse
import fnmatch
import hashlib
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

VERDICT_ENUM = {"APPROVE", "PASS", "NOT_REQUIRED", "NEEDS_FIXES", "FAIL", "BLOCKED"}
SATISFYING_VERDICTS = {"APPROVE", "PASS", "NOT_REQUIRED"}

WORKDONE_REVIEW_MD = ".claude/mode3/contracts/workdone-review.md"
WORKDONE_CANDIDATE_TMPL = ".claude/templates/workdone-candidate.toml"
GATE_RECEIPT_TMPL = ".claude/templates/gate-receipt.toml"

RECEIPT_FILENAME_RE = re.compile(r"^(?P<gate>.+?)(?:-r(?P<level>\d+))?$")
FINAL_VERDICT_RE = re.compile(r"^FINAL_VERDICT:\s*(\S+)", re.MULTILINE)
RECEIPT_SHA_LINE_RE = re.compile(r'(?m)^(receipt_sha256\s*=\s*)".*?"[ \t]*$')


# --------------------------------------------------------------------------- #
# Generic TOML / hashing helpers (mirrors verify-mode3-workdone.py)
# --------------------------------------------------------------------------- #

def load_toml_file(path: Path) -> Dict[str, Any]:
    """Load TOML file using tomllib. Returns parsed dict; raises on TOML errors."""
    if not path.exists():
        return {}
    try:
        with open(path, "rb") as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ValueError(f"TOML decode error in {path.name} at line {e.lineno}, col {e.colno}: {e.msg}")
    except Exception as e:
        raise ValueError(f"Failed to read {path.name}: {str(e)}")


def compute_sha256(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except Exception:
        return None


def compute_receipt_self_excluded_sha256(path: Path) -> Optional[str]:
    """Recompute a gate-receipt's own sha256 with the receipt_sha256 VALUE
    self-excluded (see .claude/templates/gate-receipt.toml header comment for
    the exact algorithm both the writer and this verifier must agree on)."""
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None
    excluded = RECEIPT_SHA_LINE_RE.sub(r'\1""', text)
    return hashlib.sha256(excluded.encode("utf-8")).hexdigest()


def read(root: Path, rel: str) -> str:
    p = root / rel
    return p.read_text(encoding="utf-8", errors="ignore") if p.exists() else ""


# --------------------------------------------------------------------------- #
# A) Static doc-invariant checks
# --------------------------------------------------------------------------- #

def doc_checks(root: Path) -> List[Tuple[str, bool, str]]:
    checks: List[Tuple[str, bool, str]] = []

    def add(cid: str, ok: bool, detail: str):
        checks.append((cid, ok, detail))

    workdone_review = read(root, WORKDONE_REVIEW_MD)
    if not workdone_review:
        add("workdone_review_preflight_order", True,
            "not_machine_verifiable: workdone-review.md not found (skipped)")
    else:
        gr_idx = workdone_review.find("verify-mode3-gate-receipts.py")
        wd_idx = workdone_review.find("verify-mode3-workdone.py")
        ok = gr_idx != -1 and wd_idx != -1 and gr_idx < wd_idx
        add("workdone_review_preflight_order", ok,
            "workdone-review.md Phase 7C runs verify-mode3-gate-receipts.py "
            "BEFORE verify-mode3-workdone.py")

    candidate_tmpl = read(root, WORKDONE_CANDIDATE_TMPL)
    if not candidate_tmpl:
        add("workdone_candidate_gate_evidence", True,
            "not_machine_verifiable: workdone-candidate.toml template not found (skipped)")
    else:
        ok = "mandatory_gates_satisfied" not in candidate_tmpl and "gate_evidence" in candidate_tmpl
        add("workdone_candidate_gate_evidence", ok,
            "workdone-candidate.toml template drops the literal mandatory_gates_satisfied "
            "field and carries a gate_evidence table")

    gate_receipt_tmpl = read(root, GATE_RECEIPT_TMPL)
    if not gate_receipt_tmpl:
        add("gate_receipt_template_present", False,
            "gate-receipt.toml template missing at .claude/templates/gate-receipt.toml")
    else:
        required_fields = [
            "schema_version", "issue", "run_id", "gate", "task_id", "agent",
            "verdict", "skip_rule", "reviewed_commit", "coverage_globs",
            "evidence_path", "transcript_sha256", "receipt_sha256",
        ]
        missing_fields = [f for f in required_fields if f not in gate_receipt_tmpl]
        add("gate_receipt_template_present", not missing_fields,
            "gate-receipt.toml template present with required fields" if not missing_fields
            else f"gate-receipt.toml template missing fields: {', '.join(missing_fields)}")

    return checks


# --------------------------------------------------------------------------- #
# B) Runtime receipt reconciliation
# --------------------------------------------------------------------------- #

def parse_gate_filename(name: str) -> Tuple[str, int]:
    """'code-reviewer.toml' -> ('code-reviewer', 0); 'code-reviewer-r2.toml' -> ('code-reviewer', 2)."""
    stem = name[:-len(".toml")] if name.endswith(".toml") else name
    m = re.match(r"^(.+)-r(\d+)$", stem)
    if m:
        return m.group(1), int(m.group(2))
    return stem, 0


def collect_receipts(gates_dir: Path) -> Dict[str, List[Dict[str, Any]]]:
    receipts: Dict[str, List[Dict[str, Any]]] = {}
    if not gates_dir.is_dir():
        return receipts
    for p in sorted(gates_dir.glob("*.toml")):
        gate, level = parse_gate_filename(p.name)
        receipts.setdefault(gate, []).append({"level": level, "path": p})
    return receipts


def authoritative_receipt(entries: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not entries:
        return None
    return max(entries, key=lambda e: e["level"])


def git_is_repo() -> bool:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            capture_output=True, text=True, timeout=10,
        )
        return r.returncode == 0 and r.stdout.strip() == "true"
    except (OSError, subprocess.SubprocessError):
        return False


def git_commit_resolvable(commit: str) -> bool:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--verify", f"{commit}^{{commit}}"],
            capture_output=True, text=True, timeout=10,
        )
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def git_changed_files_since(commit: str) -> Optional[List[str]]:
    try:
        r = subprocess.run(
            ["git", "diff", "--name-only", f"{commit}..HEAD"],
            capture_output=True, text=True, timeout=20,
        )
        if r.returncode != 0:
            return None
        return [l for l in r.stdout.strip().split("\n") if l]
    except (OSError, subprocess.SubprocessError):
        return None


def check_transcript(evidence_path: Path, expected_sha: Optional[str]) -> Dict[str, Any]:
    """Binds a receipt to its transcript. Returns exists/digest_ok/non_trivial/last_verdict/issues."""
    if not evidence_path.exists():
        return {"exists": False, "digest_ok": False, "non_trivial": False,
                "last_verdict": None, "issues": [f"transcript_missing: {evidence_path} not found"]}
    issues: List[str] = []
    data = evidence_path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    digest_ok = bool(expected_sha) and digest == expected_sha
    if not digest_ok:
        issues.append(
            f"transcript_digest_mismatch: computed={digest[:16]}... "
            f"expected={(expected_sha or '')[:16]}..."
        )
    text = data.decode("utf-8", errors="ignore")
    non_ws_len = len(re.sub(r"\s+", "", text))
    matches = FINAL_VERDICT_RE.findall(text)
    non_trivial = non_ws_len >= 40 and bool(matches)
    if not non_trivial:
        issues.append(
            f"transcript_trivial: {evidence_path} has <40 non-whitespace chars "
            "or no FINAL_VERDICT line"
        )
    last_verdict = matches[-1] if matches else None
    return {"exists": True, "digest_ok": digest_ok, "non_trivial": non_trivial,
            "last_verdict": last_verdict, "issues": issues}


def run_runtime_checks(issue: int, base_ref: str) -> Dict[str, Any]:
    handoff_dir = Path(f".claude/handoffs/issue-{issue}")
    handoff_path = handoff_dir / "approved-execution-handoff.toml"
    gates_dir = handoff_dir / "gates"

    checks: Dict[str, Dict[str, Any]] = {}
    failed: List[str] = []
    gate_evidence: List[Dict[str, Any]] = []

    def record(check_id: str, ok: bool, details: List[str]):
        prev = checks.get(check_id)
        if prev is not None:
            # Merge repeated per-gate calls into one check bucket.
            prev["pass"] = prev["pass"] and ok
            prev["details"].extend(details)
        else:
            checks[check_id] = {"pass": ok, "details": list(details)}
        if not ok:
            for d in details:
                failed.append(f"{check_id}: {d}")

    try:
        handoff_toml = load_toml_file(handoff_path)
    except ValueError as e:
        record("roster_declared", False, [f"failed to parse approved-execution-handoff.toml: {e}"])
        return {"pass": False, "mode": "enforce", "receipts_bootstrap": False,
                "gate_evidence": [], "checks": checks, "failed": failed}

    specialist_policy: Dict[str, Any] = {}
    executor = handoff_toml.get("executor")
    if isinstance(executor, dict):
        specialist_policy = executor.get("specialist_policy", {}) or {}

    mandatory_gates = specialist_policy.get("mandatory_gates") or []
    receipts_contract = specialist_policy.get("receipts_contract", None)

    mode = "enforce" if isinstance(receipts_contract, int) and receipts_contract >= 1 else "bootstrap"
    receipts_bootstrap = mode == "bootstrap"

    if not mandatory_gates:
        record("roster_declared", False,
               ["[executor.specialist_policy].mandatory_gates missing or empty in "
                "approved-execution-handoff.toml — cannot reconcile receipts"])
        return {"pass": False, "mode": mode, "receipts_bootstrap": receipts_bootstrap,
                "gate_evidence": [], "checks": checks, "failed": failed}
    record("roster_declared", True, [f"{len(mandatory_gates)} mandatory gate(s) declared"])

    receipts_by_gate = collect_receipts(gates_dir)

    # receipt_no_duplicate — two receipts at the same rework level for one gate.
    dup_details: List[str] = []
    for gate_name, entries in receipts_by_gate.items():
        seen: Dict[int, str] = {}
        for e in entries:
            lvl = e["level"]
            if lvl in seen:
                dup_details.append(
                    f"gate '{gate_name}' has duplicate receipts at level r{lvl}: "
                    f"{seen[lvl]} vs {e['path']}"
                )
            else:
                seen[lvl] = str(e["path"])
    record("receipt_no_duplicate", not dup_details, dup_details)

    is_git_repo = git_is_repo()
    if not is_git_repo:
        record("reviewed_commit_fresh", True,
               ["not_machine_verifiable: not in a git repository (freshness check skipped)"])

    expected_run_id = f"issue-{issue}"
    evidence_path_owner: Dict[str, str] = {}

    for gate_name in mandatory_gates:
        entries = receipts_by_gate.get(gate_name, [])
        auth = authoritative_receipt(entries)

        if auth is None:
            gate_evidence.append({
                "gate": gate_name, "status": "MISSING", "verdict": None,
                "reviewed_commit": None, "transcript_ok": False, "stale": False,
            })
            missing_detail = f"mandatory gate '{gate_name}' has no receipt under {gates_dir}"
            if mode == "enforce":
                record("receipt_present", False, [missing_detail])
            else:
                record("receipt_present", True,
                       [f"bootstrap mode — visible downgrade, not a silent pass: {missing_detail}"])
            continue

        receipt_path = auth["path"]
        try:
            receipt = load_toml_file(receipt_path)
        except ValueError as e:
            gate_evidence.append({
                "gate": gate_name, "status": "INVALID", "verdict": None,
                "reviewed_commit": None, "transcript_ok": False, "stale": False,
            })
            record("receipt_integrity", False,
                   [f"{gate_name}: failed to parse receipt {receipt_path.name}: {e}"])
            continue

        record("receipt_present", True, [f"{gate_name}: receipt found at {receipt_path}"])

        gate_status = "SATISFIED"
        stale = False
        transcript_ok = True

        r_issue = receipt.get("issue")
        r_run_id = receipt.get("run_id")
        r_gate = receipt.get("gate")
        r_verdict = receipt.get("verdict")
        r_skip_rule = receipt.get("skip_rule", "") or ""
        r_reviewed_commit = receipt.get("reviewed_commit")
        r_coverage_globs = receipt.get("coverage_globs") or []
        r_evidence_path = receipt.get("evidence_path")
        r_transcript_sha = receipt.get("transcript_sha256")
        r_receipt_sha = receipt.get("receipt_sha256")

        # receipt_gate_identity — the receipt's own `gate` field must match the
        # mandatory gate it is being reconciled against. Without this, a receipt
        # from a different gate can be copied/renamed to satisfy a gate that
        # never actually ran (its receipt_sha256 stays valid because contents
        # are untouched).
        if r_gate == gate_name:
            record("receipt_gate_identity", True,
                   [f"{gate_name}: receipt gate field matches ({r_gate!r})"])
        else:
            record("receipt_gate_identity", False,
                   [f"gate_identity_mismatch: {receipt_path} declares gate={r_gate!r}, "
                    f"reconciled as {gate_name!r}"])
            gate_status = "INVALID"

        # evidence_path_reused — no two mandatory gates in this run may cite the
        # same transcript file (a shared/reused transcript would let one real
        # review satisfy multiple gates).
        if r_evidence_path:
            prior_owner = evidence_path_owner.get(r_evidence_path)
            if prior_owner is None:
                evidence_path_owner[r_evidence_path] = gate_name
                record("evidence_path_unique", True,
                       [f"{gate_name}: evidence_path {r_evidence_path} not previously cited"])
            elif prior_owner != gate_name:
                record("evidence_path_unique", False,
                       [f"evidence_path_reused: {r_evidence_path} cited by "
                        f"{prior_owner} and {gate_name}"])
                gate_status = "INVALID"
            else:
                record("evidence_path_unique", True,
                       [f"{gate_name}: evidence_path {r_evidence_path} owned by this gate"])

        # receipt_run_match
        run_ok = (r_issue == issue) and (r_run_id == expected_run_id)
        if run_ok:
            record("receipt_run_match", True, [f"{gate_name}: issue/run_id match"])
        else:
            record("receipt_run_match", False,
                   [f"{gate_name}: receipt issue/run_id mismatch (issue={r_issue!r}, "
                    f"run_id={r_run_id!r}; expected issue={issue}, run_id={expected_run_id!r}) "
                    "— stale or cross-run receipt"])
            gate_status = "INVALID"

        # receipt_integrity — self-excluded sha256 must match stored value.
        computed_sha = compute_receipt_self_excluded_sha256(receipt_path)
        integrity_ok = bool(r_receipt_sha) and computed_sha == r_receipt_sha
        if integrity_ok:
            record("receipt_integrity", True, [f"{gate_name}: receipt_sha256 verified"])
        else:
            record("receipt_integrity", False,
                   [f"{gate_name}: receipt_sha256 mismatch/missing in {receipt_path.name} "
                    f"(computed={(computed_sha or 'none')[:16]}..., "
                    f"stored={(r_receipt_sha or 'none')[:16]}...) — hand-edit or copy-paste suspected"])
            gate_status = "INVALID"

        # receipt_verdict_allowed
        if r_verdict not in VERDICT_ENUM:
            record("receipt_verdict_allowed", False,
                   [f"{gate_name}: verdict {r_verdict!r} not in allowed enum {sorted(VERDICT_ENUM)}"])
            gate_status = "INVALID"
        else:
            if r_verdict == "NOT_REQUIRED" and not r_skip_rule.strip():
                record("receipt_verdict_allowed", False,
                       [f"{gate_name}: verdict NOT_REQUIRED requires a non-empty skip_rule"])
                gate_status = "INVALID"
            elif r_verdict not in SATISFYING_VERDICTS:
                record("receipt_verdict_allowed", False,
                       [f"{gate_name}: mandatory gate verdict is {r_verdict!r} — "
                        "does not satisfy the gate (FAIL/NEEDS_FIXES/BLOCKED)"])
                gate_status = "INVALID"
            else:
                record("receipt_verdict_allowed", True,
                       [f"{gate_name}: verdict {r_verdict!r} satisfies the gate"])

        # transcript_bound
        evidence_path = Path(r_evidence_path) if r_evidence_path else Path("")
        t = check_transcript(evidence_path, r_transcript_sha) if r_evidence_path else {
            "exists": False, "digest_ok": False, "non_trivial": False,
            "last_verdict": None, "issues": [f"{gate_name}: receipt has no evidence_path"],
        }
        transcript_bound_ok = t["exists"] and t["digest_ok"] and t["non_trivial"]
        transcript_ok = transcript_bound_ok
        if transcript_bound_ok:
            record("transcript_bound", True, [f"{gate_name}: transcript bound + non-trivial"])
        else:
            record("transcript_bound", False, [f"{gate_name}: {i}" for i in t["issues"]] or
                   [f"{gate_name}: transcript_bound check failed"])
            gate_status = "INVALID"

        # verdict_matches_transcript
        if t["exists"] and t["last_verdict"] is not None:
            if t["last_verdict"] == r_verdict:
                record("verdict_matches_transcript", True,
                       [f"{gate_name}: receipt verdict matches transcript FINAL_VERDICT"])
            else:
                record("verdict_matches_transcript", False,
                       [f"{gate_name}: receipt.verdict={r_verdict!r} != transcript "
                        f"FINAL_VERDICT={t['last_verdict']!r}"])
                gate_status = "INVALID"
        else:
            record("verdict_matches_transcript", False,
                   [f"{gate_name}: cannot compare — transcript missing or no FINAL_VERDICT line"])
            gate_status = "INVALID"

        # reviewed_commit_fresh (a7)
        if is_git_repo:
            if not r_reviewed_commit or not git_commit_resolvable(r_reviewed_commit):
                record("reviewed_commit_fresh", False,
                       [f"{gate_name}: reviewed_commit {r_reviewed_commit!r} is not a resolvable "
                        "commit (reviewed_commit_unresolvable) — fail closed"])
                gate_status = "INVALID"
            else:
                changed = git_changed_files_since(r_reviewed_commit)
                if changed is None:
                    record("reviewed_commit_fresh", False,
                           [f"{gate_name}: git diff against {r_reviewed_commit} failed"])
                    gate_status = "INVALID"
                else:
                    if r_coverage_globs:
                        stale_files = [
                            f for f in changed
                            if any(fnmatch.fnmatch(f, g) for g in r_coverage_globs)
                        ]
                        if stale_files:
                            stale = True
                            record("reviewed_commit_fresh", False,
                                   [f"{gate_name}: STALE — commits after {r_reviewed_commit} touched "
                                    f"covered files: {', '.join(stale_files[:5])}"])
                        else:
                            record("reviewed_commit_fresh", True,
                                   [f"{gate_name}: fresh — no covered file changed since "
                                    f"{r_reviewed_commit}"])
                    else:
                        # Conservative fallback: any change at all stales the gate.
                        if changed:
                            stale = True
                            record("reviewed_commit_fresh", False,
                                   [f"{gate_name}: STALE — coverage_globs absent, conservative "
                                    f"fallback (coverage_fallback=true); {len(changed)} file(s) "
                                    f"changed since {r_reviewed_commit}"])
                        else:
                            record("reviewed_commit_fresh", True,
                                   [f"{gate_name}: fresh — coverage_globs absent (conservative "
                                    "fallback) but no files changed since reviewed_commit"])

        if gate_status == "SATISFIED" and stale:
            gate_status = "STALE"

        gate_evidence.append({
            "gate": gate_name,
            "status": gate_status,
            "verdict": r_verdict,
            "reviewed_commit": r_reviewed_commit,
            "transcript_ok": transcript_ok,
            "stale": stale,
        })

    overall_pass = all(c["pass"] for c in checks.values())
    return {
        "pass": overall_pass,
        "mode": mode,
        "receipts_bootstrap": receipts_bootstrap,
        "gate_evidence": gate_evidence,
        "checks": checks,
        "failed": failed,
    }


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description="Mode-3 gate-receipt reconciliation verifier")
    ap.add_argument("--issue", type=int, required=True, help="GitHub issue number")
    ap.add_argument("--base", default="origin/main", help="Base ref (reserved; git diff uses reviewed_commit per-receipt)")
    ap.add_argument("--json", action="store_true", help="Compact JSON (default: pretty-printed)")
    ap.add_argument("--receipts-only", action="store_true", help="Run only the runtime receipt reconciliation")
    ap.add_argument("--docs-only", action="store_true", help="Run only the static doc-invariant checks")
    args = ap.parse_args()

    result: Dict[str, Any] = {
        "pass": True,
        "issue": args.issue,
        "mode": "enforce",
        "receipts_bootstrap": False,
        "gate_evidence": [],
        "checks": {},
        "failed": [],
    }

    try:
        if not args.receipts_only:
            d_checks = doc_checks(Path("."))
            docs_passed = all(ok for _, ok, _ in d_checks)
            result["docs"] = {
                "passed": docs_passed,
                "checks": [{"id": c, "ok": ok, "detail": d} for c, ok, d in d_checks],
            }
            if not docs_passed:
                result["pass"] = False
                result["failed"].extend(f"doc:{c}" for c, ok, _ in d_checks if not ok)

        if not args.docs_only:
            rt = run_runtime_checks(args.issue, args.base)
            result["mode"] = rt["mode"]
            result["receipts_bootstrap"] = rt["receipts_bootstrap"]
            result["gate_evidence"] = rt["gate_evidence"]
            result["checks"] = rt["checks"]
            result["failed"].extend(rt["failed"])
            if not rt["pass"]:
                result["pass"] = False
    except Exception as e:  # fail CLOSED — never exit 0 on an unhandled error
        result["pass"] = False
        result["checks"]["unexpected_exception"] = {"pass": False, "details": [str(e)]}
        result["failed"].append(f"unexpected_exception: {e}")

    print(json.dumps(result) if args.json else json.dumps(result, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
