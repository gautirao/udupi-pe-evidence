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
    # Added in the follow-up. A measurement standing next to the number used to veto the WHOLE
    # candidate, so all three of these returned nothing — including the +-prefixed form, which is
    # unambiguous since no price or coordinate carries a leading country code. This is idiomatic
    # listing text, not contrived. An earlier round recorded the class as "not reproducing"
    # because the probe put a WORD between number and decimal, which breaks the regex span and
    # was never affected — three variants of one shape mistaken for a class.
    ("mobile followed by a distance measurement", "call 9845012345 1.5 km from beach"),
    ("mobile followed by a bhk measurement", "contact 9845012345 2.5 bhk ready"),
    ("+-prefixed number followed by a measurement", "call +91 98450 12345 1.5 km away"),
    ("bare STD+country mobile, 091 + 10 digits", "call 0919845012345 now"),
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


def coverage_floor_arms():
    """Assert the GATE's exit codes, not just the detectors' verdicts.

    pii_residuals.py must never report clean for a sweep that examined nothing, and a real
    finding must never be downgraded to an environment error. The second half is what needs a
    test: the first implementation of the floor evaluated coverage BEFORE findings, so an
    unparseable .json — simultaneously a finding and a zero-leaf file — returned exit 2 instead
    of exit 1, and every shape case above still passed. Without these assertions the next edit
    to that block can silently re-invert the precedence.

    THE END-TO-END ARM IS THE LOAD-BEARING ONE. Every other check in this file is blind to the
    primary detection path being severed: the shape cases call find_contacts DIRECTLY, bypassing
    the sweep; the empty and zero-leaf arms expect exit 2, which needs no findings at all; the
    unparseable arm takes its exit 1 from the unconditional `unreadable` finding, which never
    consults the detector; the routing arm asserts coverage-line strings; and the
    populated-directory arm expects exit 0, which a severed detector produces too. Cut the
    `findings.append` on the JSON branch and every one of them stays green.

    That blindness was not hypothetical, and it was CREATED by this work: before the artefacts
    were sanitised they carried live PII, so the populated-directory arm expected a finding and
    would have failed on a severed sweep. Remediating the data flipped it from a positive control
    to a negative one and silently removed the suite's only end-to-end proof — the empty-dataset
    failure mode, consuming an arm's evidentiary value rather than making it unfalsifiable.

    So the planted arm restores a positive control that no longer exists in the committed data.
    Planted values are synthetic, as everywhere in this file.
    """
    import subprocess
    import tempfile

    gate = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pii_residuals.py")
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        empty = os.path.join(tmp, "empty")
        os.makedirs(empty)

        noleaf = os.path.join(tmp, "noleaf")
        os.makedirs(noleaf)
        open(os.path.join(noleaf, "notes.md"), "w").write("# no json here\n")

        bad = os.path.join(tmp, "bad")
        os.makedirs(bad)
        open(os.path.join(bad, "truncated.json"), "w").write(
            '[{"listingId": "X1", "description": "call 9845012345 now"')

        # A WELL-FORMED .json carrying a planted synthetic value. This is the only check in the
        # file that exercises the JOIN between the detector and the sweep on the JSON path —
        # which is the primary path, because that is where the artefacts are. Same synthetic
        # literal as the truncated fixture above; no new value is introduced.
        plant = os.path.join(tmp, "plant")
        os.makedirs(plant)
        open(os.path.join(plant, "seeded.json"), "w").write(
            '[{"listingId": "X1", "description": "call 9845012345 now"}]')

        for label, target, want in (
            ("empty directory exits 2, never a clean pass", empty, 2),
            ("files present but zero JSON leaves exits 2", noleaf, 2),
            ("unparseable JSON exits 1 — findings beat the floor", bad, 1),
            ("planted contact in a well-formed .json is DETECTED end to end", plant, 1),
            ("populated real directory still exits 0", os.path.dirname(gate), 0),
        ):
            rc = subprocess.run([sys.executable, gate, "--dir", target],
                                capture_output=True, text=True).returncode
            results.append((label, rc, want))
    return results


def json_routing_arm():
    """A .json parsing to top-level `null` must still be routed as JSON, not as raw text.

    Exit codes CANNOT discriminate this one — a null document contributes zero leaves either
    way, so both routes reach the same status. Only the coverage line differs, which is why this
    arm asserts the ROUTE rather than a verdict. Without it the sentinel fix is untestable and
    can be undone silently.
    """
    import subprocess
    import tempfile

    gate = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pii_residuals.py")
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, "null.json"), "w").write("null")
        out = subprocess.run([sys.executable, gate, "--dir", tmp],
                             capture_output=True, text=True).stdout
    routed_as_json = "string leaves" in out and "raw text" not in out
    return "top-level null .json routes as JSON, never to the weaker raw-text rule", routed_as_json


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

    print("GATE COVERAGE FLOOR (exit codes, not detector verdicts)")
    for label, rc, want in coverage_floor_arms():
        ok = rc == want
        failures += not ok
        total += 1
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}"
              + ("" if ok else f" -> exit {rc}, wanted {want}"))

    route_label, route_ok = json_routing_arm()
    failures += not route_ok
    total += 1
    print(f"  [{'PASS' if route_ok else 'FAIL'}] {route_label}")

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
          f"({total - min(failures, total)}/{total} checks — shape cases + gate arms"
          f"{'' if not args.baseline else ', baseline guard ' + ('PASS' if not failures else 'FAIL')})")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
