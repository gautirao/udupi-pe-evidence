#!/usr/bin/env python3
"""
Lightweight verifier harness for Antigravity Mode 3 Parity workflow.
Executes infrastructure verification checks ensuring:
- all Claude agents have Antigravity equivalents
- required specialist agents exist
- /mode3-run references specialist routing
- DB/Flyway/Supabase gate exists
- READY_TO_MERGE requires specialist matrix
- #1644/V90 checksum-risk regression example exists
- no product/backend/frontend/Flyway files were changed
"""

import os
import runpy
import sys

def run_verifier():
    script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../scripts/verify-antigravity-mode3.py"))
    if not os.path.exists(script_path):
        print(f"❌ Verification script not found at {script_path}")
        sys.exit(1)
    runpy.run_path(script_path, run_name="__main__")

if __name__ == "__main__":
    run_verifier()
