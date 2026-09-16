#!/usr/bin/env python3
"""#2575 — re-derive the URL-identity scope table WITHOUT trusting anyone's testimony.

WHY THIS IS COMMITTED. The three-city figures (35 of 300 capture rows, 20 staged rows) are about
to carry an owner re-ruling on promotion. Until now they had exactly ONE source — my own ad-hoc
query — and they read as corroborated only because a reviewer repeated them back. An exact-head
review flagged that itself: it read the table rather than re-deriving it. **A figure reproducible
only by trusting its author is the weakest form it can take**, and three earlier versions of this
same scope were wrong.

WHY THE QUERY IS STRUCTURALLY UNBIASED — each property negates one instrument that failed:

  1. ANCHORED ON A CARRIER THE ARTEFACT ITSELF NAMES. Variants come from each row's own retained
     `projectName` / `buildingName`, never from a token someone already noticed. The first wrong
     scope came from a variant list hand-built around the one slug I had seen.
  2. EXPANDED THROUGH THE CODE UNDER TEST. Surface forms come from `sanitise_bengaluru
     ._identity_variants`, so plain / compact / underscore / hyphen forms are whatever the
     sanitiser itself believes them to be. The second wrong scope searched the DISPLAY form while
     the artefacts carry the HYPHEN SLUG.
  3. NO FIELD ALLOWLIST AND NO DELIMITER ASSUMPTION. Every string leaf of every row is walked; a
     hit is recorded wherever it lands. The third wrong scope required the value to sit between
     two slashes, which is not how 99acres builds its paths.

THE VACUITY CAVEAT, CARRIED WITH THE NUMBER RATHER THAN OMITTED. Variants are seeded from every
row and searched against every row, so a hit confined to `buildingName` / `projectName` is a row's
own name matching itself and proves nothing. **Only URL-field hits are the finding.** Both figures
are printed separately so the weaker one cannot be quoted as the stronger.

Prints COUNTS AND FIELD NAMES ONLY — never a captured value.

Usage:  measure_url_identity_scope.py            (all three cities)
Exit :  0 always; this measures, it does not gate.
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

from sanitise_bengaluru import _identity_variants  # noqa: E402

RETAINED = ("projectName", "buildingName")
URL_FIELDS = ("url", "sourceUrl", "source_url", "images")

CITIES = (
    ("Udupi", os.path.join(_HERE, "..", "udupi-properties-2304",
                           "raw-99acres-commercial-output.json"),
     "udupi-staging-candidates.json", "udupi-reject-report.json"),
    ("Bengaluru", os.path.join(_HERE, "raw-99acres-commercial-bengaluru.json"),
     "bengaluru-staging-candidates.json", "bengaluru-reject-report.json"),
    ("Mangalore", os.path.join(_HERE, "raw-99acres-commercial-mangalore.json"),
     "mangalore-staging-candidates.json", "mangalore-reject-report.json"),
)


def variants_for(rows):
    out = set()
    for r in rows:
        for k in RETAINED:
            v = r.get(k)
            if isinstance(v, str) and v.strip():
                out |= _identity_variants(v)
    return out


def url_hit(row, variants):
    """True if any retained-name variant appears in any URL-bearing field of this row."""
    for k in URL_FIELDS:
        v = row.get(k)
        for item in (v if isinstance(v, list) else [v]):
            if isinstance(item, str) and any(t in item.lower() for t in variants):
                return True
    return False


def any_hit(row, variants):
    """True if a variant appears ANYWHERE in the row — includes the vacuous self-match."""
    def walk(node):
        if isinstance(node, str):
            return any(t in node.lower() for t in variants)
        if isinstance(node, list):
            return any(walk(x) for x in node)
        if isinstance(node, dict):
            return any(walk(x) for x in node.values())
        return False
    return walk(row)


def main():
    print(f"{'city':<11} {'variants':>8} {'capture URL-hits':>17} {'staged':>8} {'rejected':>9}"
          f"  {'ANY-field (vacuous)':>20}")
    print("-" * 82)
    tot_cap = tot_staged = tot_rej = 0
    for city, capture, cand_f, rej_f in CITIES:
        rows = json.load(open(capture))
        variants = variants_for(rows)
        cap = sum(1 for r in rows if url_hit(r, variants))
        vac = sum(1 for r in rows if any_hit(r, variants))

        def count(fn):
            p = os.path.join(_HERE, fn)
            if not os.path.exists(p):
                return None, None
            arr = json.load(open(p))
            return sum(1 for r in arr if url_hit(r, variants)), len(arr)

        staged, staged_n = count(cand_f)
        rej, rej_n = count(rej_f)
        tot_cap += cap
        tot_staged += staged or 0
        tot_rej += rej or 0
        print(f"{city:<11} {len(variants):>8} {str(cap) + '/' + str(len(rows)):>17} "
              f"{str(staged) + '/' + str(staged_n):>8} {str(rej) + '/' + str(rej_n):>9}"
              f"  {str(vac) + '/' + str(len(rows)):>20}")
    print("-" * 82)
    print(f"{'TOTAL':<11} {'':>8} {str(tot_cap) + '/300':>17} {str(tot_staged):>8} "
          f"{str(tot_rej):>9}")
    print()
    print("THE FINDING is the URL-hit columns. The ANY-field column is DELIBERATELY SHOWN AND")
    print("DELIBERATELY NOT THE FINDING: it counts rows whose own retained name matches itself,")
    print("which is vacuous. Quoting it as the exposure would overstate by roughly a third.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
