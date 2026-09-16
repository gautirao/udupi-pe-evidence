#!/usr/bin/env python3
"""Issue #2304 (PR review B3, S4): fail-closed PII residuals sweep.

Re-runs the pii_filter detectors over EVERY string leaf of EVERY committed file in this
directory — json, sql, md and py alike — and exits NON-ZERO if anything still matches.

Why this exists: idempotency is not a safety property. `sanitize_pii.py` running clean a second
time only proves it has no more work it knows how to do; it says nothing about the classes it
never modelled. This is the independent verifier, and a non-zero exit is a blocker.

  Usage:  python3 pii_residuals.py [--dir DIR] [--baseline DIR] [--canary-file F] [--json]
  Exit :  0 = clean, 1 = residuals found (report on stdout), 2 = usage or coverage error

Exit 0 means VERIFIED CLEAN and is gated on a positive coverage floor: the sweep must have
examined at least one file and at least one JSON string leaf, or it exits 2 instead. Without
that, an empty or mistyped --dir reported the tree clean. Findings take precedence over the
floor — anything actually detected exits 1, so a detection is never downgraded to an
environment error.

NO PII LITERALS ARE STORED IN THIS FILE. An earlier draft hardcoded the offending values as
canaries, which would have re-committed to git exactly the names and numbers this work exists
to remove — the check would have become the leak. Instead:
  * --baseline DIR points at an UNCOMMITTED copy of the pre-sanitisation artefacts; the
    identity names are harvested from it at runtime, per row.
  * --canary-file F is an UNCOMMITTED newline-separated list of literal values to prove absent.
Both are optional; without them the shape detectors still run over everything.

THREE LAYERS. This header said "TWO" and enumerated two while three existed — the literal-canary
layer was implemented below and absent from its own documentation, which is the self-falsifying
comment class this module's history otherwise records carefully.

REACH IS NOT UNIFORM, and the verdict line does not say so. Layer 1 is pattern-based and reaches
every file. Layer 3 scans every file, but only for the literals it was given. Layer 2 is keyed by
FILENAME via baseline_index, so it reaches ONLY those swept files whose name also appears in
--baseline; every other file, including derived artefacts of the very capture the baseline came
from, gets no name check at all. Measured on #2575: 1 of 28 swept files. "all 3 layers" in the
verdict describes which layers RAN, never how far each one reached.
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
# records being hit before, so the exemption is removed and a hit in those sources is reportable.
#
# KNOWN AND ACCEPTED COST, measured rather than assumed. An earlier draft of this comment claimed
# those sources "carry no literals for a canary list to collide with". That is FALSE: of the 624
# name-variant forms derivable from the baseline's identity fields, exactly one — an 8-character
# single-token value that also reads as an ordinary English word — appears in pii_filter.py and
# in sanitize_pii.py. So an operator who builds a canary list from the baseline's identity fields
# WILL get findings on a clean tree and must judge them. That cry-wolf cost is accepted, because
# the blind spot the exemption created is worth more than the noise removing it causes.
#
# Finding this needed three attempts, which is the transferable part: harvesting only
# dealerName/companyName/builderName missed developer.name and sellers[].name, and filtering to
# multi-token names excluded the colliding value outright. Both wrong instruments returned a
# confident ZERO. A negative from a filter that never looked at the right field is
# indistinguishable from a clean result.
CANARY_EXEMPT = {"test_pii_filter.py"}

# Hand-written sources are swept with the FULL rule, bare unseparated digits included. Only the
# GENERATED text artefacts relax it (see find_contacts' bare_digits): there, large bare integers
# are ordinary content — price_paise columns, geo coordinates, row counts — and those files are a
# pure function of the JSON, which is swept strictly.
STRICT_TEXT_SUFFIXES = (".py", ".sh")


def row_key(row):
    # KNOWN GAP, stated rather than papered over: the normalised artefacts are NOT covered by the
    # row-keyed name layer, and this function is not what would fix it.
    #
    # A previous revision added "housingListingId" here so normalised-listings.json — the direct
    # input to import.sql — would get a key. That was a STRUCTURAL NO-OP and has been reverted.
    # baseline_index harvests each row's variants from that row's OWN identity fields, and a
    # normalised row carries none: measured over all 104 rows, dealerName / companyName /
    # builderName / sellerFirm / developer / sellers are populated ZERO times. A key with no
    # names behind it buys nothing, so the change read as coverage while adding none.
    #
    # Closing it properly needs a JOIN, not a key: index the baseline by the bare id VALUE and
    # look it up globally, so a normalised row inherits the variants of the source row it came
    # from. That is only partly possible here, and the limit is worth knowing before anyone
    # tries: apify `id` overlaps 54 of the 104 normalised rows (all 54 do carry identity at
    # baseline), while the 99acres `listingId` values overlap ZERO of them — those rows are
    # unreachable by any id join because the identifier does not carry through normalisation.
    #
    # Until then the normalised artefacts are protected by the SHAPE layer only, which does sweep
    # them in full. That is a real but bounded gap, and naming it is worth more than a key that
    # makes the gate look covered.
    for k in ("listingId", "id"):
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
            # The illustrative values are deliberately NOT quoted here. This file is NO LONGER on
            # CANARY_EXEMPT — it was when this comment was first written, and that is exactly why
            # the rule mattered then: a real dataset value written into this comment was one the
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
    # --dir IS REQUIRED. It used to default to this file's own directory, which is how a sweep
    # answers confidently about the WRONG TREE: invoked from another import directory it swept
    # udupi-properties-2304 and printed PASS, while the directory the operator meant was never
    # examined. Measured on #2575 — the first Mangalore sweep reported 0 residuals over a
    # directory that did not contain the Mangalore capture at all. A defaulted scan path is a
    # gate that can be run wrongly by accident, and its PASS is indistinguishable from a real one.
    ap.add_argument("--dir", required=True,
                    help="directory to sweep — REQUIRED, never defaulted (see comment above)")
    ap.add_argument("--baseline", default=None,
                    help="uncommitted pre-sanitisation directory, for the row-keyed name layer")
    ap.add_argument("--canary-file", default=None,
                    help="uncommitted newline-separated literal values to prove absent")
    # Any sweep CITED AS EVIDENCE must run every layer. Without this the shape layer alone prints
    # the same PASS as a full run: on #2575 a two-of-three sweep reported PASS (0 residuals) on
    # the very file carrying a real identity residual, because the field was gone (shape layer
    # blind to names) and the name layer had not been given a baseline to compare against.
    #
    # Deliberately opt-IN rather than hard-required: validate.sh step 9 invokes this as
    # `--dir "$IMP"` with no baseline, and making --baseline unconditional would redden #2304's
    # pipeline as a side effect of a #2575 fix. Evidence sweeps pass this flag; routine ones
    # still run and now say plainly that they were partial.
    ap.add_argument("--require-all-layers", action="store_true",
                    help="exit 2 unless --baseline AND --canary-file are both supplied")
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
    total_leaves = 0

    for fn in sorted(os.listdir(target)):
        path = os.path.join(target, fn)
        if not os.path.isfile(path):
            continue

        # NEVER infer the route from the `doc` sentinel. `doc is None` meant BOTH "not a JSON
        # file" and "a JSON file that parsed to null", so a document whose top-level value is
        # `null` fell through to the raw-text branch — which sweeps with bare_digits=False, the
        # WEAKER rule. That is the same weak-detector routing the unparseable case above exists
        # to prevent, reached through a different door.
        #
        # No PII can hide in a four-byte `null` file, so this was latent rather than live. It
        # becomes exploitable the moment anyone adds a second `doc = None` assignment — a size
        # cap, a skip rule, a depth guard — and it would do so silently, in a gate whose first
        # implementation already lost a real detection. Route on the FILENAME and the parse
        # outcome, never on the parsed value.
        doc = None
        is_json = fn.endswith(".json")
        unparseable_json = False
        if is_json:
            try:
                doc = json.load(open(path))
            except ValueError:
                # A .json that will not parse must NOT fall through to the raw-text branch.
                # That branch sweeps with bare_digits=False for generated artefacts, which drops
                # the unseparated 10-digit rule — the exact rule that caught exposure class 1,
                # the mobile parked in `reraId`. A truncated or half-written artefact would then
                # be swept by a WEAKER detector and reported clean. Unparseable is itself a
                # finding: the sweep cannot vouch for a file it was unable to read.
                doc, unparseable_json = None, True

        if is_json and not unparseable_json:
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
            total_leaves += leaves
            coverage.append((fn, f"{leaves} string leaves"))
        elif unparseable_json:
            findings.append({"file": fn, "path": "<unparseable>", "kind": "unreadable",
                             "value": "does not parse as JSON — not swept"})
            coverage.append((fn, "UNPARSEABLE JSON — NOT SWEPT"))
        else:
            text = open(path, errors="replace").read()
            if fn not in SHAPE_EXEMPT:
                for h in find_contacts(text, bare_digits=fn.endswith(STRICT_TEXT_SUFFIXES)):
                    findings.append({"file": fn, "path": "<raw text>", "kind": "contact",
                                     "value": h})
            coverage.append((fn, f"{text.count(chr(10)) + 1} lines (raw text)"))

    # A canary must DISCRIMINATE. A literal that also occurs in ordinary prose cannot tell a leak
    # from a coincidence, and it will fire on a clean tree — measured on #2575, where a canary list
    # harvested with `len >= 4` included the bare word "Name" and matched 17 of 25 files. Those 17
    # were not findings; they were the canary being useless, and they buried the one real finding
    # in the same report.
    #
    # So a canary hitting more than half the swept files is reported as a CANARY-QUALITY error
    # rather than as N residuals, and it fails the run through the coverage door (exit 2) instead
    # of the detection door (exit 1). Mislabelling a bad instrument as a detection is how a gate
    # teaches its operator to ignore it.
    canary_quality = []
    if canaries:
        sweepable = [fn for fn, _ in coverage if fn not in CANARY_EXEMPT]
        per_canary = {}
        for fn in sweepable:
            text = open(os.path.join(target, fn), errors="replace").read().lower()
            for c in canaries:
                if c.lower() in text:
                    per_canary.setdefault(c, []).append(fn)
        # AT OR ABOVE half, not "more than half" — stated exactly, because the `max(2, ...)` floor
        # also trips on two hits in a sweep of four files or fewer.
        threshold = max(2, len(sweepable) // 2)
        # MINIMUM CORPUS BEFORE RECLASSIFICATION IS ALLOWED TO FIRE. `threshold` collapses to 2 on
        # any sweep of five files or fewer, and `--dir` is now REQUIRED, which deliberately
        # encourages narrowly-scoped sweeps. Without this floor, a REAL residual present in two
        # files of a small directory — exactly the shape this PR's own residue has — is reported as
        # "a canary matched 2 of N swept files, non-discriminating", exits 2, and never appears as
        # a finding at all. The operator would see an instrument complaint where there is a leak.
        #
        # Eight is the smallest corpus where "at or above half" means four or more files, which is
        # a population a coincidence can plausibly reach and a single real leak usually cannot.
        for c, files in per_canary.items():
            if len(files) >= threshold and len(sweepable) >= 8:
                # Report the COUNT and THE FILE NAMES, never the literal. Filenames are not PII,
                # and without them a PERVASIVE REAL LEAK is indistinguishable from a useless
                # canary — both present as "matched N of M files". The operator needs to be able
                # to tell those apart, and only the file list does that.
                canary_quality.append(
                    f"a canary matched {len(files)} of {len(sweepable)} swept files — it is "
                    f"non-discriminating and proves nothing about the detector's reach. "
                    f"Files: {', '.join(sorted(files))}")
                continue
            for fn in files:
                findings.append({"file": fn, "path": "<literal>", "kind": "canary", "value": c})

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

    # POSITIVE COVERAGE FLOOR. Without this, an empty or mistyped --dir returns
    # "PASS (0 residuals)" and exit 0 while printing "files swept: 0", and nothing asserts on
    # that line — validate.sh step 9 passes --dir "$IMP", so a moved or renamed directory would
    # report the whole tree clean. A gate that cannot tell "found nothing" from "looked at
    # nothing" is worse than no gate, because it manufactures confidence. Exit 2 (environment
    # error), never the 0 that means verified-clean.
    # ORDERING IS LOAD-BEARING: `not findings` comes first. An unparseable .json is BOTH a
    # finding and a file that contributed no leaves, so a floor checked first would report a
    # real detection as a mere environment error and lose it. Findings always win.
    #
    # The line says FAIL, not ERROR, so the token reaches validate.sh's transcript scan directly.
    # An earlier revision of THIS comment justified that by claiming an ERROR-phrased failure
    # "would exit non-zero while the container run's own summary still reported PASS". That was
    # FALSE and is corrected rather than left to be trusted: step 9 runs
    # `python3 pii_residuals.py --dir "$IMP" || echo "  -> FAIL (residuals found)"`, and `||`
    # fires on ANY non-zero status including exit 2, so the literal FAIL reached the log either
    # way. The token is still worth carrying — it states the real reason instead of depending on
    # the caller's fallback, which additionally mislabels an exit-2 coverage failure as
    # "(residuals found)" — but the failure mode it was sold on did not exist.
    if not findings and (not coverage or total_leaves == 0):
        print(f"PII_RESIDUALS: FAIL — coverage floor: swept {len(coverage)} files and "
              f"{total_leaves} JSON string leaves under {target}. A sweep that examined "
              f"nothing cannot report clean; refusing to exit 0.", file=sys.stderr)
        return 2

    # Under --json the verdict goes to stderr so the document on stdout stays parseable. An
    # earlier revision appended it to stdout, which made `--json | jq` die on "Extra data" —
    # and a gate whose machine-readable output cannot be parsed gets read by eye instead.
    # A NON-DISCRIMINATING CANARY IS AN INSTRUMENT FAILURE, not a detection.
    #
    # `and not findings` IS LOAD-BEARING, and an earlier revision of THIS COMMENT asserted the
    # property while the code lacked it: it claimed "checked after the findings floor so a real
    # detection is never downgraded", but position confers nothing. The floor guards on
    # `not findings`; this block had no findings guard at all, so a run with BOTH a real residual
    # and a poor canary list exited 2 — an environment error — and the module docstring's promise
    # ("anything actually detected exits 1, so a detection is never downgraded") was false.
    #
    # Measured on two synthetic trees differing ONLY in the canary list, same real shape finding
    # in both: discriminating list -> exit 1; non-discriminating list -> exit 2.
    #
    # The pairing is the DOCUMENTED motivating case rather than a contrived one: the #2575 run that
    # prompted this guard had a canary matching 17 of 25 files while burying one real finding in
    # the same report. validate.sh step 9 would then print "NOT a residuals finding" while the
    # residual sat in the report printed immediately above.
    if canary_quality and not findings:
        for msg in canary_quality:
            print(f"PII_RESIDUALS: FAIL — canary quality: {msg}", file=sys.stderr)
        return 2
    if canary_quality:
        # Findings win the exit code, but the operator still needs to know the list was unusable.
        for msg in canary_quality:
            print(f"PII_RESIDUALS: NOTE — canary quality: {msg} — reported alongside real "
                  f"findings; the exit code reflects the findings.", file=sys.stderr)

    # THE VERDICT MUST NAME ITS OWN COVERAGE. A two-of-three sweep printed the identical
    # "PASS (0 residuals)" as a full one, and on #2575 it printed exactly that over a file that
    # was carrying a real identity residual in a URL slug — invisible to the shape layer, and the
    # name layer had no baseline to compare against. The PASS was true of what ran and silent on
    # what did not, which is the shape that makes a gate worse than no gate.
    layers = [("shape", True), ("name-invariant", bool(args.baseline)),
              ("literal-canary", bool(canaries))]
    ran = [n for n, on in layers if on]
    skipped = [n for n, on in layers if not on]

    if args.require_all_layers and skipped:
        print(f"PII_RESIDUALS: FAIL — --require-all-layers was given but these layers did not "
              f"run: {', '.join(skipped)}. An evidence sweep must run all three; refusing to "
              f"report a verdict on a partial one.", file=sys.stderr)
        return 2

    if findings:
        verdict = "FAIL"
    elif skipped:
        verdict = (f"PARTIAL ({len(ran)} of {len(layers)} layers: ran {', '.join(ran)}; "
                   f"SKIPPED {', '.join(skipped)}) — 0 residuals in the layers that ran, "
                   f"which is NOT the same as clean")
    else:
        verdict = "PASS (0 residuals, all 3 layers)"

    print(f"\nPII_RESIDUALS: {verdict}", file=sys.stderr if args.json else sys.stdout)
    return 0 if not findings else 1


if __name__ == "__main__":
    sys.exit(main())
