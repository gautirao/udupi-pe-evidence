#!/usr/bin/env python3
"""Regression fixture for the pii_filter detectors (issue #2304, PR review S4).

Every MUST_MATCH case is a real value that leaked past an earlier revision of the filter, and
every MUST_NOT_MATCH case is a real value that an earlier revision wrongly destroyed or that
would make the fail-closed gate cry wolf. Both directions matter: a detector that matches
everything is as useless as one that matches nothing, and the false-positive column is not
hypothetical — the two housing.com resale URLs below were genuinely corrupted into
"[redacted-phone]" by the first draft of the widened phone rule.

NO REAL DATASET VALUE MAY APPEAR HERE. pii_residuals.py exempts this file from its shape
detectors (it necessarily contains contact-shaped literals), which makes it the one place in
the tree where the fail-closed gate is switched off — so a real value landed here is a real
value the gate will never report. That is not hypothetical: an earlier revision of this fixture
carried a live dealer mobile verbatim, spelled out word-by-word, copied straight from a raw
`description`. Every case is therefore SHAPE-only: documentation-range numbers, example.com
addresses, or a real shape with digits altered.

`--baseline DIR` enforces exactly that, so the rule is executable rather than a comment asking
for diligence: it asserts no MUST_MATCH literal (or its decoded digit form) occurs anywhere in
the pre-sanitisation artefacts.

  Usage:  python3 test_pii_filter.py [--baseline DIR]
  Exit :  0 = all cases behave, 1 = at least one regression or a baseline leak
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pii_filter import find_contacts  # noqa: E402

# Shapes that MUST be detected. Each corresponds to a class that escaped a previous revision.
MUST_MATCH = [
    ("bare 10-digit mobile in a non-obvious field", "8277719671"),
    ("international / non-Indian locale", "Uae whatsapp: +971 50 393 6351 "),
    ("space-separated local number", "Cl: 94811 70690"),
    ("digits spelled out to defeat masking",
     "contact wtzapp :- Seven two zero eight six one six four five three ."),
    ("e-mail address", "Email: Someagent@example.Com"),
    ("dash-separated 10-digit", "call 98765-43210 now"),
    ("parenthesised landline", "(0820) 2570 100 x"),
    # Added in review of PR #2587. Both shapes were MISSED by every layer of the gate until
    # _is_phone learned to strip a bare STD/country prefix; verified failing before the fix.
    ("bare STD-prefixed mobile, 0 + 10 digits, no separators", "call 09845012345 now"),
    ("bare country-coded mobile, 91 + 10 digits, no plus", "call 919845012345 now"),
]

# Shapes that MUST NOT be detected — real content from this dataset that is not a contact.
MUST_NOT_MATCH = [
    ("housing.com resale URL slug (listing id + bedroom count)",
     "https://housing.com/in/buy/resale/page/20734582-3-bhk-independent-floor-in-manipal-for-rs-9800000"),
    ("housing.com resale URL slug, 4 BHK variant",
     "https://housing.com/in/buy/resale/page/20380169-4-bhk-independent-house-in-kinnimulki-for-rs-15000000"),
    ("CDN path containing a 32-char hex hash",
     "https://is1-2.housingcdn.com/012c1500/b5351d4e8513507380ca0b3d4feaebab/v0/version.jpeg"),
    ("price_paise, 10 digits", "1250000000"),
    ("price_paise, 9 digits", "850000000"),
    ("geo coordinate", "13.3876323"),
    ("coordinate range in report prose", "the 2 real listing coordinates (13.310-13.318, 74.736)"),
    ("bbox arithmetic in the normaliser source", "13.3876323 - 0.012"),
    ("ISO 8601 timestamp", "2026-08-23T08:44:37.253Z"),
    ("99acres spid", "91975192"),
    ("this import's own synthetic seed address", "housing-import-udupi@seed.local"),
    ("built area", "8000 sqft"),
    ("portal-masked partial number", "81056....."),
    # Guards the prefix-stripping added above: a 12-digit paise magnitude must not become a
    # phone number just because its first two digits happen to be 9 and 1.
    ("price_paise, 12 digits with a 91 lead", "915000000000"),
]


_WORDS = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
          "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9"}


def decoded_digits(s):
    """The digit string a word-encoded number decodes to, or '' if there isn't one.

    Needed because a spelled-out number and its digits are the same secret in two encodings:
    checking only the literal would miss a fixture that spells out a number the baseline stores
    numerically, which is precisely how the leak this guard exists to prevent got in.
    """
    run = [_WORDS[w] for w in re.findall(r"[A-Za-z]+", s.lower()) if w in _WORDS]
    return "".join(run) if len(run) >= 7 else ""


def baseline_leak_check(baseline_dir):
    """Assert no MUST_MATCH literal appears in the pre-sanitisation artefacts.

    This is the executable form of the invariant pii_residuals.py's SHAPE_EXEMPT relies on.
    Without it, the exemption is only a comment, and the gate reports a clean tree while the
    exempt file holds a real value.
    """
    blobs = {}
    for fn in sorted(os.listdir(baseline_dir)):
        path = os.path.join(baseline_dir, fn)
        if not os.path.isfile(path):
            continue
        blobs[fn] = open(path, errors="replace").read().lower()

    leaks = []
    for label, s in MUST_MATCH:
        needles = {s.strip().lower()}
        # Also test the significant literal on its own, not just the sentence wrapper.
        for frag in re.findall(r"[+\d][\d\s\-().]{6,20}\d|[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+", s):
            needles.add(frag.strip().lower())
        digits = decoded_digits(s)
        if digits:
            needles.add(digits)
        for fn, blob in blobs.items():
            for n in needles:
                if len(n) >= 8 and n in blob:
                    leaks.append((label, n, fn))
    return leaks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default=None,
                    help="uncommitted pre-sanitisation artefact dir; asserts no MUST_MATCH "
                         "literal is a real value from it")
    args = ap.parse_args()

    failures = 0
    print("MUST MATCH")
    for label, s in MUST_MATCH:
        hits = find_contacts(s)
        ok = bool(hits)
        failures += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}")
    print("MUST NOT MATCH")
    for label, s in MUST_NOT_MATCH:
        hits = find_contacts(s)
        ok = not hits
        failures += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + ("" if ok else f" -> {hits}"))
    total = len(MUST_MATCH) + len(MUST_NOT_MATCH)

    print("NO REAL VALUE IN THIS FIXTURE")
    if not args.baseline:
        print("  [SKIP] no --baseline given; guard NOT run "
              "(supply the uncommitted pre-sanitisation dir to enforce it)")
    elif not os.path.isdir(args.baseline):
        print(f"  [FAIL] --baseline is not a directory: {args.baseline}")
        failures += 1
    else:
        leaks = baseline_leak_check(args.baseline)
        if leaks:
            failures += len(leaks)
            for label, needle, fn in leaks:
                print(f"  [FAIL] {label}: {needle!r} is a REAL value, present in {fn}")
        else:
            print(f"  [PASS] no MUST_MATCH literal occurs in {os.path.basename(args.baseline)}")

    print(f"\nPII_FILTER_SELFTEST: {'PASS' if not failures else 'FAIL'} "
          f"({total - min(failures, total)}/{total} shape cases"
          f"{'' if not args.baseline else ', baseline guard ' + ('PASS' if not failures else 'FAIL')})")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
