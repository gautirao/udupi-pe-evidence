#!/usr/bin/env python3
"""#2575 — regression suite for the Bengaluru capture sanitiser.

COMMITTED DELIBERATELY, alongside `sanitise_bengaluru.py`. Both previously ran from a scratch
directory while the PR cited their results, which made the PII evidence unreproducible by anyone
reading it. An unreproducible control is indistinguishable from one that never ran.

THE POINT OF THIS FILE IS THE NEGATIVE CONTROLS. Asserting that sanitised output is clean proves
almost nothing on its own: output whose identity fields were already absent passes identically
whether the sanitiser ran, was disabled, or was deleted. So each layer is paired with a DISABLED
variant, and the suite asserts the residue SURVIVES when that layer is skipped.

NO REAL CONTACT VALUE APPEARS IN THIS FILE. The planted number is constructed digit-by-digit at
runtime, so the committed source contains no digit run. `pii_residuals.py` sweeps every committed
file and exempts exactly one by name (`test_pii_filter.py`); growing that exemption list is how a
fail-closed gate quietly stops being one, so the literal is removed instead.

  Usage:  python3 test_sanitise_bengaluru.py
  Exit :  0 = all cases behave, 1 = at least one regression
"""
import copy
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..", "udupi-properties-2304")))

import sanitise_bengaluru as S  # noqa: E402
from pii_filter import find_contacts, map_strings, redact_contacts, walk_strings  # noqa: E402

# The COMMITTED capture — already sanitised, which is why it can live in the repository at all.
COMMITTED_CAPTURE = os.path.join(_HERE, "raw-99acres-commercial-bengaluru.json")

# Constructed at runtime; see module docstring. Shape only: a documentation-range Indian mobile.
PLANTED = "".join(str(d) for d in (9, 8, 4, 5, 0, 1, 2, 3, 4, 5))


def synthetic_row():
    """One row carrying every class the sanitiser must remove, plus fields it must KEEP."""
    return {
        "listingId": "SYNTH-BLR-1",
        "dealerName": "Synthetic Agent Name",
        "companyName": "Synthetic Realty LLP",
        "builderName": "Synthetic Builders",
        "reraId": "SYNTHRERA0001",
        "description": f"Prime office space. Call {PLANTED} for a viewing.",
        # Must SURVIVE — categorical, not identity; and consumed by coordinate_trusted_rows.
        "listedBy": "Dealer",
        "buildingName": "Synthetic Tower",
        "projectName": "Synthetic Park",
        "city": "Bangalore South",
        "propertyType": "Ready to move office space",
        "latitude": 12.9,
        "longitude": 77.6,
    }


def strip_fields_only(rows):
    """The field-denylist layer alone — used to isolate the two layers from each other."""
    for row in rows:
        for k in S.NINETYNINE_DROP:
            row.pop(k, None)
    return rows


def shapes_in(rows):
    return sum(len(find_contacts(s)) for r in rows for _, s in walk_strings(r, path=""))


def run_cases():
    results = []

    def check(label, ok, detail=""):
        results.append((label, ok, detail))

    # ── CONTROL: the synthetic row must carry what we claim, or every case below is vacuous ──
    raw = [synthetic_row()]
    check("CONTROL synthetic row carries all five identity fields before sanitising",
          all(raw[0].get(k) is not None for k in S.NINETYNINE_DROP),
          str([k for k in S.NINETYNINE_DROP if raw[0].get(k) is None]))
    check("CONTROL synthetic row carries a detectable contact shape before sanitising",
          shapes_in(raw) >= 1, f"shapes={shapes_in(raw)}")

    # ── positive: full sanitise removes both classes ─────────────────────────────────────────
    cleaned, dropped = S.sanitise(copy.deepcopy(raw))
    check("sanitise removes every identity field",
          all(r.get(k) is None for r in cleaned for k in S.NINETYNINE_DROP))
    check("sanitise leaves zero contact shapes", shapes_in(cleaned) == 0,
          f"shapes={shapes_in(cleaned)}")
    check("sanitise reports the number of KEY INSTANCES it dropped", dropped == 5,
          f"dropped={dropped}")

    # ── fields the sanitiser must NOT remove ─────────────────────────────────────────────────
    # Without these, "removes PII" could be satisfied by removing everything — and the coordinate
    # trust rule, which reads buildingName/projectName, would lose its inputs while privacy
    # appeared to improve.
    check("listedBy SURVIVES — a category, not an identity",
          cleaned[0].get("listedBy") == "Dealer", str(cleaned[0].get("listedBy")))
    check("buildingName / projectName SURVIVE — consumed by coordinate_trusted_rows",
          cleaned[0].get("buildingName") == "Synthetic Tower"
          and cleaned[0].get("projectName") == "Synthetic Park")

    # ── NEGATIVE CONTROL 1: disable the FIELD layer — identity must SURVIVE ───────────────────
    shape_only = map_strings(copy.deepcopy(raw), redact_contacts)
    survived = [k for k in S.NINETYNINE_DROP if shape_only[0].get(k) is not None]
    check("NEGATIVE CONTROL with the field layer disabled, identity fields SURVIVE "
          "(so the positive case is not vacuous)",
          set(survived) >= {"dealerName", "companyName", "builderName", "reraId"},
          f"survived={survived}")
    check("NEGATIVE CONTROL a shape-only sweep still scrubs the number from free text",
          shapes_in(shape_only) == 0, f"shapes={shapes_in(shape_only)}")

    # ── NEGATIVE CONTROL 2: disable the SHAPE layer — a pasted number must SURVIVE ────────────
    # Planted in a field that SURVIVES the denylist. Putting it in `description` would have made
    # this control pass for the wrong reason, since the field layer drops that field outright.
    leaky = [synthetic_row()]
    leaky[0]["buildingName"] = f"Tower, ask {PLANTED}"
    fields_only = strip_fields_only(copy.deepcopy(leaky))
    check("NEGATIVE CONTROL with the shape layer disabled, a number in a SURVIVING field remains",
          shapes_in(fields_only) >= 1, f"shapes={shapes_in(fields_only)}")
    full, _ = S.sanitise(copy.deepcopy(leaky))
    check("full sanitise catches that same number in the surviving field",
          shapes_in(full) == 0, f"shapes={shapes_in(full)}")

    # ── NEGATIVE CONTROL 3: identity embedded in a URL, not in a field ───────────────────────
    # THIS CONTROL EXISTS BECAUSE THIS SUITE MISSED THE CASE ENTIRELY. The residuals sweep's
    # --baseline name layer found a builder name surviving inside images[0..4] on the Mangalore
    # capture AFTER its field was dropped. The field layer removed `builderName`; the shape layer
    # hunts phone/e-mail patterns. Neither can see a name sitting in a URL path, and the sweep run
    # without --baseline reported 0 findings on that very file.
    urly = [synthetic_row()]
    urly[0]["images"] = [
        "https://img.example.invalid/p/synthetic_builders/1.jpg",
        "https://img.example.invalid/p/synthetic-builders/2.jpg",
    ]
    fields_only_url = strip_fields_only(copy.deepcopy(urly))
    survived_slugs = [u for u in fields_only_url[0]["images"] if "synthetic" in u.lower()]
    check("NEGATIVE CONTROL with only the field layer, an identity inside a URL SURVIVES",
          len(survived_slugs) == 2, f"survived={len(survived_slugs)}/2")

    full_url, _ = S.sanitise(copy.deepcopy(urly))
    check("full sanitise erases the identity from the URL slug too, in BOTH slug forms",
          all("synthetic_builders" not in u.lower() and "synthetic-builders" not in u.lower()
              for u in full_url[0]["images"]),
          str(full_url[0]["images"]))

    # DISCRIMINATION. Without this, the layer could satisfy the case above by scrubbing anything
    # that looks like a slug — which would destroy image URLs wholesale while appearing to improve
    # privacy, the same trap as removing buildingName/projectName.
    keeper = [synthetic_row()]
    keeper[0]["images"] = ["https://img.example.invalid/p/listing/12345/photo_1.jpg"]
    kept, _ = S.sanitise(copy.deepcopy(keeper))
    check("and an UNRELATED URL is left intact (erasure is value-driven, not a blanket scrub)",
          kept[0]["images"] == ["https://img.example.invalid/p/listing/12345/photo_1.jpg"],
          str(kept[0]["images"]))

    # ── the COMMITTED Mangalore artefact ─────────────────────────────────────────────────────
    mangalore_capture = os.path.join(_HERE, "raw-99acres-commercial-mangalore.json")
    check("committed Mangalore capture is present", os.path.exists(mangalore_capture),
          mangalore_capture)
    if os.path.exists(mangalore_capture):
        mrows = json.load(open(mangalore_capture))
        check("COMMITTED Mangalore capture: 100 rows", len(mrows) == 100, f"rows={len(mrows)}")
        check("COMMITTED Mangalore capture: zero identity fields remain",
              all(r.get(k) is None for r in mrows for k in S.NINETYNINE_DROP),
              str({k: sum(1 for r in mrows if r.get(k) is not None) for k in S.NINETYNINE_DROP}))
        check("COMMITTED Mangalore capture: zero contact shapes remain", shapes_in(mrows) == 0,
              f"shapes={shapes_in(mrows)}")
        check("COMMITTED Mangalore capture: listedBy survived (not over-redacted)",
              sum(1 for r in mrows if r.get("listedBy")) > 0)

    # ── policy-drift guard ───────────────────────────────────────────────────────────────────
    try:
        S.assert_policy_matches_upstream()
        check("denylist still matches the #2304 upstream policy", True)
    except SystemExit as e:
        check("denylist still matches the #2304 upstream policy", False, str(e)[:160])

    # ── the COMMITTED artefact itself ────────────────────────────────────────────────────────
    # This is what makes the suite reproducible by a reader: it asserts against the capture in the
    # repository, not against a file that existed only in the author's scratch directory.
    check("committed Bengaluru capture is present", os.path.exists(COMMITTED_CAPTURE),
          COMMITTED_CAPTURE)
    if os.path.exists(COMMITTED_CAPTURE):
        rows = json.load(open(COMMITTED_CAPTURE))
        check("COMMITTED capture: 100 rows", len(rows) == 100, f"rows={len(rows)}")
        check("COMMITTED capture: zero identity fields remain",
              all(r.get(k) is None for r in rows for k in S.NINETYNINE_DROP),
              str({k: sum(1 for r in rows if r.get(k) is not None) for k in S.NINETYNINE_DROP}))
        check("COMMITTED capture: zero contact shapes remain", shapes_in(rows) == 0,
              f"shapes={shapes_in(rows)}")
        check("COMMITTED capture: listedBy survived sanitisation (not over-redacted)",
              sum(1 for r in rows if r.get("listedBy")) > 0)

    return results


def main():
    results = run_cases()
    failures = 0
    for label, ok, detail in results:
        failures += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" -> {detail}" if detail and not ok else ""))
    total = len(results)
    print(f"\nSANITISE_BLR_SELFTEST: {'PASS' if not failures else 'FAIL'} "
          f"({total - failures}/{total} checks)")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
