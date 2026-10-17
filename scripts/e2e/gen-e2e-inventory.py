#!/usr/bin/env python3
"""Deterministic Playwright inventory generator (issue #2750).

Writes docs/testing/e2e-inventory.md with a BEFORE section (the base commit the retirement series
starts from) and an AFTER section (a ref, default HEAD). Everything is derived from git objects
(`git ls-tree` + `git show <ref>:<path>`), never from the working tree, so the output is
byte-identical for the same pair of refs: no timestamps, no host paths, sorted keys.

Usage:
  python3 -I scripts/e2e/gen-e2e-inventory.py [--before-ref SHA] [--after-ref REF] [--out FILE] [--check]

  --before-ref  default 092914d6e9c418590ab73ca1f3a65099b50da1d2 (base of issue #2750)
  --after-ref   default HEAD. The doc prints the ref LABEL as given (never a resolved sha), so it does
                not go stale the moment a commit lands; pass an explicit sha to pin it.
  --check       exit 1 if the existing --out differs from a fresh generation (CI/guard usage).
"""
import argparse
import json
import os
import re
import subprocess
import sys

BASE_SHA = "092914d6e9c418590ab73ca1f3a65099b50da1d2"
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def git(*args):
    return subprocess.run(["git", "-C", REPO_ROOT, *args], capture_output=True, text=True, check=True).stdout


class Ref:
    def __init__(self, ref):
        self.ref = ref
        self.files = sorted(f for f in git("ls-tree", "-r", "--name-only", ref).splitlines() if f)
        self._set = set(self.files)

    def has(self, path):
        return path in self._set

    def read(self, path):
        return subprocess.run(["git", "-C", REPO_ROOT, "show", f"{self.ref}:{path}"], capture_output=True,
                              text=True, errors="replace", check=True).stdout


MATCHABLE = re.compile(r"\.(spec|test)\.(ts|js|mjs|cjs|tsx|jsx)$")
TEST_RE = re.compile(r"^\s*(?:test|it)(?:\.(only|fixme|skip|fail|slow))?\(\s*[`'\"]", re.M)
COND_SKIP_RE = re.compile(r"\btest\.(skip|fixme)\(\s*(?![`'\"])", re.M)
CANON_ID_RE = re.compile(r"^(?:\s*\[role:\w+\])*\s*((?:T\d+[a-z]?|CC\d+[a-z]?|RQ\d+|AG\d+))(?![A-Za-z0-9])")
TITLE_RE = re.compile(r"\btest(?:\.describe(?:\.(?:serial|parallel))?)?\s*\(\s*(['\"`])((?:\\.|(?!\1)[^\\])*)\1")


def strip_comments(src):
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)
    return "\n".join("" if re.match(r"^\s*//", l) else l for l in src.split("\n"))


def bucket(path):
    b = os.path.basename(path)
    if b.startswith(("capture-", "probe-")) or "screenshot" in b:
        return "evidence_capture"
    if path.startswith("e2e/journey/"):
        return "journey"
    if path.startswith("e2e/discover/"):
        return "discover_subdir"
    return "top_level"


def projects_of(ref):
    """Legacy project name -> {match, ignore} parsed from playwright.config.ts at the ref."""
    if not ref.has("playwright.config.ts"):
        return {}
    cfg = ref.read("playwright.config.ts")
    out = {}
    for m in re.finditer(r"name:\s*'([^']+)'(.*?)\n    \}", cfg, re.S):
        name, body = m.group(1), m.group(2)
        tm = re.search(r"testMatch:\s*\[(.*?)\]", body, re.S)
        ti = re.search(r"testIgnore:\s*\[(.*?)\]", body, re.S)
        out[name] = {"match": re.findall(r"'([^']+)'", tm.group(1)) if tm else None,
                     "ignore": re.findall(r"'([^']+)'", ti.group(1)) if ti else []}
    return out


def glob_hit(path, pat):
    rx, i = "", 0
    while i < len(pat):
        if i == 0 and pat.startswith("**/"):
            rx += ".*/"
            i += 3
        elif pat.startswith("/**/", i):
            rx += "/(?:.*/)?"
            i += 4
        elif pat[i] == "*":
            rx += "[^/]*"
            i += 1
        else:
            rx += re.escape(pat[i])
            i += 1
    return re.fullmatch(rx, "/" + path) is not None


def member_of(projects, path):
    res = []
    for name, rule in projects.items():
        ok = path.endswith(".spec.ts") if rule["match"] is None else any(glob_hit(path, p) for p in rule["match"])
        if ok and any(glob_hit(path, p) for p in rule["ignore"]):
            ok = False
        if ok:
            res.append(name)
    return res


def analyse(ref, path):
    src = ref.read(path)
    mods = [m for m in TEST_RE.findall(src)]
    loop = bool(re.search(r"for\s*\([^)]*\)\s*\{[^}]*?\btest\(", src, re.S)) or \
        bool(re.search(r"\.forEach\([^)]*=>\s*\{?\s*test\(", src, re.S))
    return {
        "tests": len(mods),
        "skip": mods.count("skip") + mods.count("fixme") + len(COND_SKIP_RE.findall(src)),
        "loop": loop,
        "mocks": len(re.findall(r"\bpage\.route\(|context\.route\(|routeFromHAR", src)) > 0,
    }


def snapshot(ref):
    legacy = [f for f in ref.files if f.startswith("e2e/") and MATCHABLE.search(f) and not f.startswith("e2e/canonical/")]
    parity = [f for f in ref.files if f.startswith("e2e-parity/") and MATCHABLE.search(f)]
    canon = [f for f in ref.files if f.startswith("e2e/canonical/") and f.endswith(".canonical.ts")
             and "/support/" not in f]
    specialist = [f for f in ref.files if f.startswith("e2e/specialist/") and f.endswith(".specialist.ts")
                  and "/support/" not in f]
    legacy_rows = {f: analyse(ref, f) for f in legacy}
    canon_tests, canon_ids = 0, []
    for f in canon:
        src = ref.read(f)
        canon_tests += len(TEST_RE.findall(src))
        for m in TITLE_RE.finditer(strip_comments(src)):
            im = CANON_ID_RE.match(m.group(2))
            if im:
                canon_ids.append(im.group(1))
    projects = projects_of(ref)
    pkg = json.loads(ref.read("package.json")) if ref.has("package.json") else {}
    scripts = {k: v for k, v in sorted(pkg.get("scripts", {}).items()) if re.search(r"playwright|e2e", k + " " + v)}
    ci_jobs = []
    for f in [x for x in ref.files if x.startswith(".github/workflows/")]:
        cur = None
        for line in ref.read(f).splitlines():
            m = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
            if m:
                cur = m.group(1)
            if cur and re.search(r"playwright|test:e2e|run-e2e-gate|check-canonical-journeys", line):
                key = f"{os.path.basename(f)}:{cur}"
                if key not in ci_jobs:
                    ci_jobs.append(key)
    return {
        "legacy_spec_files": len(legacy),
        "legacy_static_test_callsites": sum(r["tests"] for r in legacy_rows.values()),
        "legacy_files_with_loop_generated_tests": sum(1 for r in legacy_rows.values() if r["loop"]),
        "legacy_files_with_network_mocks": sum(1 for r in legacy_rows.values() if r["mocks"]),
        "legacy_files_with_skip_or_fixme": sum(1 for r in legacy_rows.values() if r["skip"]),
        "legacy_by_bucket": {b: sum(1 for f in legacy if bucket(f) == b) for b in sorted({bucket(f) for f in legacy})},
        "legacy_project_membership": {p: sum(1 for f in legacy if p in member_of(projects, f)) for p in sorted(projects)},
        "canonical_spec_files": len(canon),
        "canonical_static_tests": canon_tests,
        "canonical_ids_in_titles": sorted(set(canon_ids), key=lambda s: (re.sub(r"\d+.*", "", s), int(re.search(r"\d+", s).group()), s)),
        "parity_spec_files": len(parity),
        "specialist_spec_files": len(specialist),
        "playwright_configs": sorted(f for f in ref.files if re.search(r"(^|/)playwright[^/]*config[^/]*\.ts$", f)),
        "package_scripts_mentioning_e2e": scripts,
        "ci_jobs_invoking_playwright": sorted(ci_jobs),
        "manifest_present": ref.has("docs/testing/e2e-retirement-manifest.csv"),
        "journey_matrix_present": ref.has("e2e/canonical/journey-matrix.json"),
    }


def section(title, label, snap):
    lines = [f"## {title}", "", f"Ref: `{label}`", "", "```json", json.dumps(snap, indent=2, sort_keys=True), "```", ""]
    return "\n".join(lines)


def build(before_ref, after_ref):
    before, after = snapshot(Ref(before_ref)), snapshot(Ref(after_ref))
    delta = []
    for k in ("legacy_spec_files", "legacy_static_test_callsites", "canonical_spec_files", "canonical_static_tests", "parity_spec_files", "specialist_spec_files"):
        delta.append(f"| {k} | {before[k]} | {after[k]} | {after[k] - before[k]:+d} |")
    head = [
        "# E2E inventory (generated)",
        "",
        "Generated by `python3 -I scripts/e2e/gen-e2e-inventory.py` (issue #2750). Do not edit by hand: regenerate.",
        "Derived from git objects only, so the same refs always produce byte-identical output. Counts here are",
        "static source counts (`test(...)` call sites); the number Playwright COLLECTS is reported by",
        "`npm run test:e2e:gate` (`--list`) and by the canonical journey checker.",
        "",
        "| metric | before | after | delta |",
        "|---|---:|---:|---:|",
        *delta,
        "",
        section("BEFORE (retirement series base)", before_ref, before),
        section("AFTER", after_ref, after),
    ]
    return "\n".join(head).rstrip("\n") + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before-ref", default=BASE_SHA)
    ap.add_argument("--after-ref", default="HEAD")
    ap.add_argument("--out", default=os.path.join(REPO_ROOT, "docs", "testing", "e2e-inventory.md"))
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    text = build(a.before_ref, a.after_ref)
    if a.check:
        cur = open(a.out).read() if os.path.exists(a.out) else ""
        if cur != text:
            sys.stderr.write("e2e-inventory.md is stale: regenerate with python3 -I scripts/e2e/gen-e2e-inventory.py\n")
            return 1
        return 0
    with open(a.out, "w") as fh:
        fh.write(text)
    sys.stdout.write("wrote %s\n" % os.path.relpath(a.out, REPO_ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
