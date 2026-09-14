#!/usr/bin/env python3
"""Issue #2304 (PR review B3, S4): fail-closed PII residuals sweep.

Re-runs the pii_filter detectors over EVERY string leaf of EVERY committed file in this
directory — json, sql, md and py alike — and exits NON-ZERO if anything still matches.

Why this exists: idempotency is not a safety property. `sanitize_pii.py` running clean a second
time only proves it has no more work it knows how to do; it says nothing about the classes it
never modelled. This is the independent verifier, and a non-zero exit is a blocker.

  Usage:  python3 pii_residuals.py [--dir DIR] [--baseline DIR] [--canary-file F] [--json]
  Exit :  0 = clean, 1 = residuals found (report on stdout), 2 = usage error

NO PII LITERALS ARE STORED IN THIS FILE. An earlier draft hardcoded the offending values as
canaries, which would have re-committed to git exactly the names and numbers this work exists
to remove — the check would have become the leak. Instead:
  * --baseline DIR points at an UNCOMMITTED copy of the pre-sanitisation artefacts; the
    identity names are harvested from it at runtime, per row.
  * --canary-file F is an UNCOMMITTED newline-separated list of literal values to prove absent.
Both are optional; without them the shape detectors still run over everything.

TWO LAYERS
  1. Shape detectors (email / telephone / digits-spelled-as-words) — applied to every string
     leaf of every file, unconditionally. Hand-written sources (.py/.sh) are swept with the FULL
     rule, bare unseparated digits included. Only the GENERATED text artefacts (.sql/.md) relax
     that rule, and they are a pure function of the JSON, which is swept strictly — so coverage
     is not reduced. See pii_filter for the numeric boundary rule.
  2. Row-keyed name invariant — for every row, none of the identity names that row carried at
     baseline (dealerName / companyName / builderName / developer.name / sellers[].name) may
     appear anywhere in that row's string leaves, in plain, hyphen-slug or underscore-slug form.
     Row-keyed rather than global, so a corporate brand legitimately retained in one row's
     consumed `projectName` cannot mask the same string leaking as another row's seller name.

COVERAGE is 100% of every file, never a sample: JSON is parsed and walked recursively to every
string leaf; other files are scanned as raw text. Per-file leaf/line counts are printed so a
reader can confirm the sweep actually reached the whole of a 37k-line artefact.
"""
import argparse
import json
import os
import sys

from pii_filter import find_contacts, find_names, name_variants, walk_strings

# One tuple spanning every scrape schema in the repo, not just this directory's. The Bangalore
# (#1723) actor emits the identity as `sellerFirm` and has neither sellers[].name nor
# developer.name, so a key list written around the Udupi field names reports that import clean
# no matter how exposed it is — which is exactly how #1723 survived the #2304 review. A new
# scrape schema MUST add its identity key here, or the name layer is silently blind to it.
IDENTITY_KEYS = ("dealerName", "companyName", "builderName", "sellerFirm")

# The regression fixture necessarily CONTAINS contact-shaped literals — that is what it tests —
# so scanning it finds the test cases, not data. It is the ONLY file exempt from the shape
# detectors, and its values are synthetic by construction (documentation-range numbers and
# example.com addresses); no real dataset value is permitted there. Every other file in this
# directory, including the filter and sanitiser sources, is scanned in full: an earlier draft of
# those sources embedded real names and numbers in their docstrings, which this sweep is
# precisely the right mechanism to catch.
SHAPE_EXEMPT = {"test_pii_filter.py"}
# Only the regression fixture is exempt from the literal-canary layer. An earlier revision also
# exempted pii_filter.py / pii_residuals.py / sanitize_pii.py, so that a canary list could not
# match their own documentation — but combined with the bare-digit relaxation for non-JSON files
# below, that left a bare unseparated mobile written into any of those three sources invisible to
# ALL THREE layers at once: no name layer runs on .py, the shape layer dropped the bare-digit
# rule, and the canary layer skipped the file. That is exactly the trap this module's history
# records being hit before. Those sources now carry no literals for a canary list to collide
# with, so the exemption is removed and a hit there is reportable.
CANARY_EXEMPT = {"test_pii_filter.py"}

# Hand-written sources are swept with the FULL rule, bare unseparated digits included. Only the
# GENERATED text artefacts relax it (see find_contacts' bare_digits): there, large bare integers
# are ordinary content — price_paise columns, geo coordinates, row counts — and those files are a
# pure function of the JSON, which is swept strictly.
STRICT_TEXT_SUFFIXES = (".py", ".sh")


def row_key(row):
    # housingListingId is included so normalised-listings.json and
    # normalised-listings-housingcom-only.json — the direct input to import.sql — are reachable
    # by the row-keyed name layer. Keyed on neither `listingId` nor `id`, both files previously
    # returned None here and so fell outside that layer entirely, despite being consumed.
    for k in ("listingId", "id", "housingListingId"):
        if row.get(k) is not None:
            return f"{k}={row[k]}"
    return None


def row_identity_names(row):
    names = set()
    for k in IDENTITY_KEYS:
        if row.get(k):
            names.add(str(row[k]).strip())
    dev = row.get("developer")
    if isinstance(dev, dict) and dev.get("name"):
        names.add(str(dev["name"]).strip())
    for s in (row.get("sellers") or []):
        if isinstance(s, dict) and s.get("name"):
            names.add(str(s["name"]).strip())
    return {n for n in names if n}


def baseline_index(baseline_dir):
    """{filename: {row_key: {name variants}}} harvested from the pre-sanitisation copy."""
    index = {}
    if not baseline_dir or not os.path.isdir(baseline_dir):
        return index
    for fn in sorted(os.listdir(baseline_dir)):
        if not fn.endswith(".json"):
            continue
        try:
            rows = json.load(open(os.path.join(baseline_dir, fn)))
        except (ValueError, OSError):
            continue
        if not isinstance(rows, list):
            continue
        per_row = {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            k = row_key(r)
            if not k:
                continue
            # Multi-token names only. A single given name is indistinguishable from a genuine
            # building name — Indian buildings are routinely named after their owner, so this
            # dataset legitimately contains several rows whose `dealerName` is one given name
            # and whose `buildingName` is that same word plus "Complex" / "Apartments". Those
            # fields are CONSUMED (coordinate-trust clustering, and such rows are imported), so
            # flagging them would demand corrupting real listing data for no privacy gain: a
            # building's name is public signage, not contact information. Multi-token names
            # carry no such ambiguity.
            #
            # The illustrative values are deliberately NOT quoted here. This file is on
            # CANARY_EXEMPT, so a real dataset value written into this comment is one the
            # literal layer will never report — the same way a live mobile once reached the
            # regression fixture. Describe the shape; never paste the value.
            variants = set()
            for n in row_identity_names(r):
                if len(n.split()) >= 2 and len(n) > 6:
                    variants |= name_variants(n)
            if variants:
                per_row[k] = variants
        if per_row:
            index[fn] = per_row
    return index


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--baseline", default=None,
                    help="uncommitted pre-sanitisation directory, for the row-keyed name layer")
    ap.add_argument("--canary-file", default=None,
                    help="uncommitted newline-separated literal values to prove absent")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    target = os.path.abspath(args.dir)
    if not os.path.isdir(target):
        print(f"not a directory: {target}", file=sys.stderr)
        return 2

    index = baseline_index(args.baseline)
    canaries = []
    if args.canary_file:
        canaries = [l.strip() for l in open(args.canary_file) if l.strip()]

    findings, coverage = [], []
    names_checked = 0

    for fn in sorted(os.listdir(target)):
        path = os.path.join(target, fn)
        if not os.path.isfile(path):
            continue

        doc = None
        if fn.endswith(".json"):
            try:
                doc = json.load(open(path))
            except ValueError:
                doc = None

        if doc is not None:
            leaves = 0
            for p, s in walk_strings(doc, fn):
                leaves += 1
                for h in find_contacts(s):
                    findings.append({"file": fn, "path": p, "kind": "contact", "value": h})
            # Layer 2, row-keyed.
            per_row = index.get(fn, {})
            if per_row and isinstance(doc, list):
                for r in doc:
                    if not isinstance(r, dict):
                        continue
                    variants = per_row.get(row_key(r) or "", set())
                    if not variants:
                        continue
                    names_checked += 1
                    for p, s in walk_strings(r, f"{fn}[{row_key(r)}]"):
                        for h in find_names(s, variants):
                            findings.append({"file": fn, "path": p, "kind": "name", "value": h})
            coverage.append((fn, f"{leaves} string leaves"))
        else:
            text = open(path, errors="replace").read()
            if fn not in SHAPE_EXEMPT:
                for h in find_contacts(text, bare_digits=fn.endswith(STRICT_TEXT_SUFFIXES)):
                    findings.append({"file": fn, "path": "<raw text>", "kind": "contact",
                                     "value": h})
            coverage.append((fn, f"{text.count(chr(10)) + 1} lines (raw text)"))

    if canaries:
        for fn, _ in coverage:
            if fn in CANARY_EXEMPT:
                continue
            text = open(os.path.join(target, fn), errors="replace").read().lower()
            for c in canaries:
                if c.lower() in text:
                    findings.append({"file": fn, "path": "<literal>", "kind": "canary",
                                     "value": c})

    report = {
        "target": target,
        "files_swept": len(coverage),
        "coverage": [{"file": f, "scanned": c} for f, c in coverage],
        "rows_with_name_invariant_checked": names_checked,
        "canaries_checked": len(canaries),
        "findings": findings,
    }

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"PII residuals sweep — {target}")
        print(f"  files swept                    : {len(coverage)}")
        for f, c in coverage:
            print(f"      {f:<45} {c}")
        print(f"  rows under name invariant      : {names_checked}"
              + ("" if args.baseline else "   (no --baseline: name layer NOT run)"))
        print(f"  canaries checked               : {len(canaries)}"
              + ("" if canaries else "   (no --canary-file: literal layer NOT run)"))
        if SHAPE_EXEMPT:
            print(f"  shape-detector exemptions      : {sorted(SHAPE_EXEMPT)}")
        print(f"  findings                       : {len(findings)}")
        for f in findings[:80]:
            print(f"      [{f['kind']}] {f['file']} {f.get('path','')} -> {f['value']!r}")

    # Under --json the verdict goes to stderr so the document on stdout stays parseable. An
    # earlier revision appended it to stdout, which made `--json | jq` die on "Extra data" —
    # and a gate whose machine-readable output cannot be parsed gets read by eye instead.
    print(f"\nPII_RESIDUALS: {'PASS (0 residuals)' if not findings else 'FAIL'}",
          file=sys.stderr if args.json else sys.stdout)
    return 0 if not findings else 1


if __name__ == "__main__":
    sys.exit(main())
