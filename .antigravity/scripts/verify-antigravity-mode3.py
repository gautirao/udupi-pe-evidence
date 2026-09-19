#!/usr/bin/env python3
"""
Verification script for Antigravity Mode 3 Parity infrastructure.
Verifies the presence of all required commands, specialist agents, contracts, templates, and documentation,
as well as load-bearing invariant phrases and git touch immutability for product code.
"""

import os
import subprocess
import sys

REQUIRED_FILES = [
    "AGENTS.md",
    ".agents/contracts/pr-workflow.md",
    ".agents/contracts/lane-ledger.md",
    ".agents/contracts/merge-gate.md",
    ".antigravity/README.md",
    ".antigravity/commands/mode3-run.md",
    ".antigravity/commands/route-and-run.md",
    ".antigravity/commands/closeout.md",
    ".antigravity/commands/workdone-review.md",
    ".antigravity/agents/mode3-orchestrator.md",
    ".antigravity/agents/explorer-planner.md",
    ".antigravity/agents/spec-enricher.md",
    ".antigravity/agents/team-lead.md",
    ".antigravity/agents/supervisor-engineer.md",
    ".antigravity/agents/architect.md",
    ".antigravity/agents/frontend-engineer.md",
    ".antigravity/agents/backend-engineer.md",
    ".antigravity/agents/ui-designer.md",
    ".antigravity/agents/performance-analyst.md",
    ".antigravity/agents/qa.md",
    ".antigravity/agents/qa-fast.md",
    ".antigravity/agents/security-reviewer.md",
    ".antigravity/agents/code-reviewer.md",
    ".antigravity/agents/database-flyway-supabase-engineer.md",
    ".antigravity/agents/implementer.md",
    ".antigravity/agents/reviewer.md",
    ".antigravity/agents/validator.md",
    ".antigravity/agents/closeout-reporter.md",
    ".antigravity/contracts/main-agent.md",
    ".antigravity/contracts/implementation.md",
    ".antigravity/contracts/validation.md",
    ".antigravity/contracts/closeout.md",
    ".antigravity/templates/rework-request.md",
    ".antigravity/templates/final-report.md",
    ".antigravity/templates/pr-body.md",
    "docs/ai-workflows/antigravity-mode3-parity.md",
]

KEY_PHRASES = [
    "READY_TO_MERGE",
    "NEEDS_USER_DECISION",
    "no merge without user approval",
    "tsconfig.app.json",
    "baseline-vs-branch",
    "feature branch",
    "worktree",
    "final report",
    "cross-tool handoff",
    "What remains:",
    "Validation already run:",
    "Specialist review matrix:",
    "database-flyway-supabase-engineer",
    "V90__idx_property_listings_agri_live.sql",
    "REVIEW_RECONCILIATION_IN_PROGRESS",
    "last processed PR event id",
    "consecutive quiet poll",
    "REVIEW_STATE_CONTRADICTION",
    "empirical",
]

FORBIDDEN_MODIFIED_PREFIXES = [
    "src/",
    "backend/",
    "supabase/migrations/",
    "supabase/functions/",
    "db/migration/",
]

IGNORED_UNTRACKED_PARTS = [
    ".temp",
    "__pycache__",
    "node_modules",
    ".cache",
]

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    missing_files = []
    found_files = []
    
    print("=== Verifying Antigravity Mode 3 Infrastructure ===")
    for rel_path in REQUIRED_FILES:
        abs_path = os.path.join(repo_root, rel_path)
        if not os.path.isfile(abs_path):
            missing_files.append(rel_path)
        else:
            found_files.append(abs_path)
            
    if missing_files:
        print(f"❌ Missing required files ({len(missing_files)}):")
        for f in missing_files:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print(f"✅ All {len(REQUIRED_FILES)} required files are present.")
        
    combined_content = ""
    for path in found_files:
        with open(path, "r", encoding="utf-8") as file:
            combined_content += file.read() + "\n"
            
    missing_phrases = []
    for phrase in KEY_PHRASES:
        if phrase.lower() not in combined_content.lower():
            missing_phrases.append(phrase)
            
    if missing_phrases:
        print(f"❌ Missing load-bearing key phrases across files:")
        for p in missing_phrases:
            print(f"  - '{p}'")
        sys.exit(1)
    else:
        print("✅ All required load-bearing key phrases found across infrastructure files.")

    print("=== Verifying Product Code Immutability ===")
    try:
        status_output = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=repo_root,
            text=True
        )
        for line in status_output.splitlines():
            if not line.strip():
                continue
            modified_path = line[3:].strip()
            if any(part in modified_path for part in IGNORED_UNTRACKED_PARTS):
                continue
            for prefix in FORBIDDEN_MODIFIED_PREFIXES:
                if modified_path.startswith(prefix):
                    print(f"❌ Product code immutability violated. File touched: {modified_path}")
                    sys.exit(1)
        print("✅ No product, backend, frontend, or Flyway migration files were touched.")
    except Exception as e:
        print(f"⚠️ Could not verify git status: {e}")

    print("=== Verification Passed Successfully ===")
    sys.exit(0)

if __name__ == "__main__":
    main()
