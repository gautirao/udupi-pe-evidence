#!/usr/bin/env python3
"""Issue #2575 — regression suite for adapter_99acres_commercial.

DESIGN: MECHANISM IS ASSERTED, REAL-DATA STATUS IS REPORTED.

The real capture currently exercises only the Sale path and only three of the five subtypes, so
several of the contracts this adapter must honour have NOTHING in the committed data to test
against. Asserting them against the real capture alone would produce green results that pass by
having nothing to examine — the failure mode where a suite is loudest and least informative.

So every contract is tested against SYNTHETIC rows built here, in both directions: a case that
must be caught, and a case that must not. Where a synthetic row stands in for real inventory the
test says so in its name. The real capture is used for the two things it genuinely settles —
end-to-end counts and other-family leakage.

NO REAL CONTACT VALUE APPEARS IN THIS FILE. The planted PII case uses a documentation-range
shape, the same rule test_pii_filter.py enforces for itself.

  Usage:  python3 test_adapter_99acres_commercial.py
  Exit :  0 = every case behaves, 1 = at least one regression
"""
import copy
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import adapter_99acres_commercial as A  # noqa: E402

CAPTURE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "udupi-properties-2304", "raw-99acres-commercial-output.json",
)

RUN = {"source_platform": "99acres", "import_issue": 2575, "city": "Udupi"}


def _synthetic(**over):
    """A minimal row that PASSES every gate, so a single overridden field is the only variable.

    Coordinates sit inside the Udupi envelope and inside the Manipal bbox, and the coordinate is
    unique, so the row survives the trust filter on its own. This is a CONTROL ROW: if it ever
    stops passing, the negative cases below become meaningless and the suite says so.
    """
    row = {
        "listingId": "SYNTH-CONTROL-1",
        "url": "https://example.invalid/listing/synth-control-1",
        "propertyType": "Commercial Shops",
        "transactionType": "Sale",
        "price": 5000000,
        "area": 800,
        "areaUnit": "sqft",
        "latitude": 13.3500,
        "longitude": 74.7900,
        "locality": "Manipal",
        "title": "Shop for sale in Manipal",
        "scrapedAt": "2026-08-23T08:44:37.253Z",
        "buildingName": None,
        "projectName": None,
    }
    row.update(over)
    return row


def run_cases():
    results = []

    def check(label, ok, detail=""):
        results.append((label, ok, detail))

    # ---- control: the synthetic row must pass, or every negative case is vacuous -------------
    cands, rejects, stats = A.adapt([_synthetic()], "Udupi", RUN)
    check("CONTROL synthetic row normalizes (negatives below are meaningful only if this passes)",
          len(cands) == 1 and not rejects, f"{len(cands)} cand / {len(rejects)} rej")

    # ---- taxonomy: never a sixth subtype ------------------------------------------------------
    c = cands[0] if cands else {}
    check("subtype stays inside the canonical five",
          c.get("commercial_subtype") in A.VALID_SUBTYPES, str(c.get("commercial_subtype")))

    # ---- label VARIANT vs new CONCEPT: the line between normalisation and taxonomy -------------
    # #2575's Mangalore capture emits the bare label "Shop" (3 rows) alongside "Commercial Shops".
    # Same concept, different string, so mapping it is normalisation. "Co-working office space" is
    # a distinct commercial product, so folding it into OFFICE by resemblance would be a product
    # judgement wearing normalisation's clothes — it stays rejected and visible.
    shop = _synthetic(listingId="SYNTH-SHOP-VARIANT", propertyType="Shop",
                      latitude=13.3506, longitude=74.7906)
    cands_s, rejects_s, _ = A.adapt([shop], "Udupi", RUN)
    s = cands_s[0] if cands_s else {}
    check("the bare label 'Shop' normalises to commercial/SHOP, like 'Commercial Shops'",
          bool(cands_s) and s.get("commercial_subtype") == "SHOP"
          and s.get("property_type") == "commercial",
          f"subtype={s.get('commercial_subtype')} type={s.get('property_type')} "
          f"rejects={[x.get('reject_reason') for x in rejects_s]}")

    # REDDENS IF THE MAP ENTRY IS REMOVED. Asserted against the SHARED map directly, not only
    # through adapt(), so the arm stays pointed at the mapping rather than at downstream behaviour
    # that might coincidentally still pass.
    check("GUARD 'Shop' is present in the shared map (deleting it reddens this arm)",
          A.map_commercial_type("Shop") == ("commercial", "COMMERCIAL"),
          str(A.map_commercial_type("Shop")))

    # NON-RETROACTIVITY. Adding a label to a shared map reclassifies HISTORY unless the label is
    # absent from prior captures. If "Shop" appeared in either, the 11 Udupi / 32 Bengaluru staged
    # counts asserted in the ITs would silently move and nothing here would redden.
    _blr = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "raw-99acres-commercial-bengaluru.json")
    with open(CAPTURE) as _f:
        _prior_udupi = json.load(_f)
    with open(_blr) as _f:
        _prior_blr = json.load(_f)
    _shop_in_prior = (sum(1 for r in _prior_udupi if r.get("propertyType") == "Shop")
                      + sum(1 for r in _prior_blr if r.get("propertyType") == "Shop"))
    check("adding 'Shop' is NON-RETROACTIVE: the exact label is absent from BOTH prior captures",
          _shop_in_prior == 0, f"{_shop_in_prior} prior row(s) would have been reclassified")

    # POSITIVE COMPANION: the check above only ever expects zero, so a capture loaded as empty
    # would satisfy it completely. This asserts the captures actually contain the sibling label,
    # proving the files were read and the zero means absence rather than nothing-to-look-at.
    _siblings = (sum(1 for r in _prior_udupi if r.get("propertyType") == "Commercial Shops")
                 + sum(1 for r in _prior_blr if r.get("propertyType") == "Commercial Shops"))
    check("and those captures were genuinely read (sibling label 'Commercial Shops' is present)",
          _siblings == 26, f"expected 21 Udupi + 5 Bengaluru = 26, got {_siblings}")

    cowork = _synthetic(listingId="SYNTH-COWORK", propertyType="Co-working office space",
                        latitude=13.3507, longitude=74.7907)
    cands_cw, rejects_cw, _ = A.adapt([cowork], "Udupi", RUN)
    check("'Co-working office space' still REJECTS — a new concept is a taxonomy decision",
          not cands_cw and rejects_cw
          and rejects_cw[0]["reject_reason"] in ("unmapped_type", "ambiguous_or_missing_type"),
          rejects_cw[0]["reject_reason"] if rejects_cw else "no reject emitted")

    # ---- other-family leakage: the gate this issue names --------------------------------------
    agri = _synthetic(listingId="SYNTH-AGRI", propertyType="Agricultural/Farm Land",
                      latitude=13.3501, longitude=74.7901)
    cands_a, rejects_a, _ = A.adapt([agri], "Udupi", RUN)
    check("AGRICULTURAL row is rejected from the Commercial pipeline, with a reason",
          not cands_a and rejects_a and rejects_a[0]["reject_reason"] == "not_commercial_family",
          rejects_a[0]["reject_reason"] if rejects_a else "no reject emitted")

    # Mutation control: prove the gate is doing the work, not the type map. A row that IS
    # commercial must NOT be caught by the same gate.
    check("MUTATION CONTROL a genuine Commercial row is not caught by the family gate",
          bool(cands) and cands[0]["property_family"] == "COMMERCIAL",
          str(c.get("property_family")))

    # ---- Sale/Rent money separation ------------------------------------------------------------
    # SYNTHETIC BY NECESSITY: the committed capture is Sale-only (all 100 rows), so the Rent half
    # of this contract has no real row anywhere in the repo to test against. Asserting it against
    # the capture would pass by examining nothing.
    rent = _synthetic(listingId="SYNTH-RENT", transactionType="Rent", price=45000,
                      latitude=13.3502, longitude=74.7902)
    cands_r, _, _ = A.adapt([rent], "Udupi", RUN)
    r = cands_r[0] if cands_r else {}
    check("SYNTHETIC rent row carries monthly_rent and NO sale price band",
          bool(cands_r) and r.get("monthly_rent") == 45000
          and r.get("price") is None and r.get("price_paise") is None,
          f"rent={r.get('monthly_rent')} price={r.get('price')} paise={r.get('price_paise')}")
    check("sale row carries price/price_paise and NO monthly_rent",
          bool(cands) and c.get("price") == 5000000 and c.get("price_paise") == 500000000
          and c.get("monthly_rent") is None,
          f"price={c.get('price')} rent={c.get('monthly_rent')}")

    # ---- 'lease' must not become a persisted third value --------------------------------------
    lease = _synthetic(listingId="SYNTH-LEASE", transactionType="Lease", price=60000,
                       latitude=13.3503, longitude=74.7903)
    cands_l, _, _ = A.adapt([lease], "Udupi", RUN)
    check("a Lease source row collapses to persisted 'rent', never a new LEASE value",
          bool(cands_l) and cands_l[0]["listing_purpose"] == "rent"
          and cands_l[0]["source_transaction_type"] == "Lease",
          cands_l[0]["listing_purpose"] if cands_l else "no candidate")

    # ---- never invent: missing price is a reject, not a zero ------------------------------------
    nop = _synthetic(listingId="SYNTH-NOPRICE", price=None,
                     latitude=13.3504, longitude=74.7904)
    cands_n, rejects_n, _ = A.adapt([nop], "Udupi", RUN)
    check("missing price is REJECTED, never defaulted to 0",
          not cands_n and rejects_n and rejects_n[0]["reject_reason"] == "missing_price",
          rejects_n[0]["reject_reason"] if rejects_n else "no reject emitted")

    # ---- ambiguous labels are not guessed ------------------------------------------------------
    amb = _synthetic(listingId="SYNTH-HOTEL", propertyType="Hotel/Resorts",
                     latitude=13.3505, longitude=74.7905)
    cands_amb, rejects_amb, _ = A.adapt([amb], "Udupi", RUN)
    check("an ambiguous source label is rejected rather than inferred into a subtype",
          not cands_amb and rejects_amb
          and rejects_amb[0]["reject_reason"] == "ambiguous_or_missing_type",
          rejects_amb[0]["reject_reason"] if rejects_amb else "no reject emitted")

    # ---- geography: a coordinate outside the city envelope is not silently kept ----------------
    far = _synthetic(listingId="SYNTH-FAR", latitude=12.9716, longitude=77.5946)  # Bengaluru
    cands_f, rejects_f, _ = A.adapt([far], "Udupi", RUN)
    check("a coordinate outside the city envelope is rejected",
          not cands_f and rejects_f
          and rejects_f[0]["reject_reason"] in ("out_of_geography", "area_unresolved"),
          rejects_f[0]["reject_reason"] if rejects_f else "no reject emitted")

    # ---- no invented city profile --------------------------------------------------------------
    # THE SUBJECT MOVED, THE ASSERTION DID NOT. "Bengaluru" was the unprofiled city this case
    # asserted on; it is now a real profile backed by the seeded V71/V106 bounds, so the check
    # went red. The test was right and its premise changed — it is repointed at a city that
    # genuinely has no seeded areas, never weakened or deleted, which would have been the easy
    # way to turn it green while destroying what it was buying.
    try:
        A.profile_for("Mysuru")
        check("an unknown city RAISES rather than inventing area bounds", False, "did not raise")
    except NotImplementedError:
        check("an unknown city RAISES rather than inventing area bounds", True)

    # POSITIVE COMPANION — without it the case above does not discriminate. It only ever expects a
    # raise, so a profile_for that raised for EVERY city would satisfy it completely and be
    # useless. This asserts the other direction: profiled cities must resolve.
    try:
        resolved = {c: A.profile_for(c).city for c in ("Udupi", "Bangalore", "Bengaluru")}
        ok = resolved == {"Udupi": "Udupi", "Bangalore": "Bangalore", "Bengaluru": "Bangalore"}
        check("every PROFILED city resolves (so the raise above is not a blanket refusal)",
              ok, str(resolved))
    except NotImplementedError as e:
        check("every PROFILED city resolves (so the raise above is not a blanket refusal)",
              False, f"raised for a profiled city: {e}")

    # The two spellings must be the SAME object. Two equivalent-looking profiles could drift —
    # one gaining a bound or an envelope the other lacks — and every test above would still pass
    # while the two spellings silently resolved differently.
    check("the Bengaluru spelling is an ALIAS of Bangalore, not a divergent second profile",
          A.profile_for("Bengaluru") is A.profile_for("Bangalore"))

    # ---- PII gate, both directions -------------------------------------------------------------
    # Planted value is a documentation shape, never a real contact — same rule test_pii_filter.py
    # enforces on itself.
    # Constructed digit-by-digit so this FILE stores no contact-shaped literal of its own.
    # pii_residuals.py sweeps every committed file and exempts exactly one by name
    # (test_pii_filter.py). A literal here would trip that fail-closed gate — and the right
    # answer is to not store one, never to grow the exemption list, because an exemption list
    # is how a fail-closed gate quietly stops being one. Verified by running the sweep over
    # this directory: it reports clean only because no digit run exists in this source.
    planted_number = "".join(str(d) for d in (9, 8, 4, 5, 0, 1, 2, 3, 4, 5))
    planted = _synthetic(listingId="SYNTH-PII", title=f"call {planted_number} now")
    try:
        A.assert_no_pii([planted], "synthetic")
        check("PII gate DETECTS a planted contact shape (positive control)", False, "gate passed")
    except SystemExit as e:
        leaked = planted_number in str(e)
        check("PII gate DETECTS a planted contact shape (positive control)", True)
        check("PII gate reports PATHS only and never echoes the matched value",
              not leaked, "value appeared in the failure message" if leaked else "")

    with open(CAPTURE) as f:
        capture = json.load(f)
    try:
        A.assert_no_pii(capture, "raw-99acres-commercial-output.json")
        check("PII gate passes the committed, sanitised capture (negative control)", True)
    except SystemExit as e:
        check("PII gate passes the committed, sanitised capture (negative control)", False, str(e)[:120])

    # ---- office-precedence DETECTOR, tested in both directions ---------------------------------
    # The detector's MECHANISM is asserted here; its verdict on the real capture is REPORTED by
    # the adapter's run summary, not asserted, so that PR #2594 merging cannot break this suite.
    office_raw = [_synthetic(listingId="SYNTH-OFFICE", propertyType="Ready to move office space")]
    wrong_when_building = A.validate_office_precedence(
        office_raw, [{"source_listing_id": "SYNTH-OFFICE", "commercial_subtype": "BUILDING"}])
    wrong_when_office = A.validate_office_precedence(
        office_raw, [{"source_listing_id": "SYNTH-OFFICE", "commercial_subtype": "OFFICE"}])
    check("office detector FLAGS an office label carrying BUILDING", len(wrong_when_building) == 1)
    check("office detector is SILENT when the same label carries OFFICE "
          "(so it is not hardcoded to fail)", wrong_when_office == [])

    # ---- idempotency: a rerun is a pure function of its input -----------------------------------
    a1, r1, _ = A.adapt(copy.deepcopy(capture), "Udupi", RUN)
    a2, r2, _ = A.adapt(copy.deepcopy(capture), "Udupi", RUN)
    check("rerunning the adapter over the same capture is byte-identical",
          json.dumps(a1, sort_keys=True) == json.dumps(a2, sort_keys=True)
          and json.dumps(r1, sort_keys=True) == json.dumps(r2, sort_keys=True))

    # ---- end-to-end on the real capture: the two things it genuinely settles --------------------
    check("every reject carries a reason (a silent drop is indistinguishable from absence)",
          all(x.get("reject_reason") for x in r1), "")
    check("candidates + rejects account for every fetched row",
          len(a1) + len(r1) == len(capture), f"{len(a1)}+{len(r1)} vs {len(capture)}")
    # ZERO other-family leakage — asserted over the SOURCE label, never over property_family.
    #
    # HIGH-1 from exact-head review of 1e2878cc. The previous form was
    #     all(x["property_family"] == "COMMERCIAL" for x in a1)
    # which CANNOT FAIL: adapt() stamps "property_family": "COMMERCIAL" as a literal on every
    # candidate it appends, so that compared a value assigned moments earlier over the same rows.
    # Verified by the reviewer's revert test: delete the family gate and all 19 Agricultural rows
    # flow into the candidate set, each stamped "COMMERCIAL" on the way in, and the suite still
    # reports 23/23. Nothing else caught it either — an Agricultural row's property_type is absent
    # from PROPERTY_TYPE_TO_SUBTYPE so its subtype is None, which the taxonomy check permits.
    #
    # The source label is the input the gate actually reads, so these two DO redden when it goes.
    check("ZERO non-Commercial rows reach the candidate set (asserted over the SOURCE label)",
          all(A.map_commercial_type(x["source_property_type"])[1] == "COMMERCIAL" for x in a1),
          str({x["source_property_type"] for x in a1}))
    check("no Agricultural source row reaches the candidate set",
          not any(x["source_property_type"] == "Agricultural/Farm Land" for x in a1),
          str([x["source_listing_id"] for x in a1
               if x["source_property_type"] == "Agricultural/Farm Land"]))

    # NON-VACUITY GUARD for the two checks above. Rather than trusting that they would redden,
    # construct the exact state the removed gate would produce — an Agricultural row carrying the
    # COMMERCIAL family stamp — and assert the OLD predicate accepts it while the NEW one rejects
    # it. This encodes the reviewer's revert test so it stays true, instead of relying on someone
    # re-deriving it later.
    leaked = {"source_property_type": "Agricultural/Farm Land", "property_family": "COMMERCIAL"}
    check("GUARD the retired predicate would have accepted a leaked Agricultural row",
          leaked["property_family"] == "COMMERCIAL")
    check("GUARD the replacement predicate rejects that same row (so it is not vacuous)",
          A.map_commercial_type(leaked["source_property_type"])[1] != "COMMERCIAL")
    check("every candidate subtype is inside the canonical five (or an honest NULL)",
          all(x["commercial_subtype"] in A.VALID_SUBTYPES | {None} for x in a1),
          str({x["commercial_subtype"] for x in a1}))
    check("every candidate carries the (source_platform, source_listing_id) identity",
          all(x["source_platform"] and x["source_listing_id"] for x in a1))
    check("source identity is unique across candidates (no duplicate staged rows)",
          len({(x["source_platform"], x["source_listing_id"]) for x in a1}) == len(a1))

    return results


def main():
    results = run_cases()
    failures = 0
    for label, ok, detail in results:
        failures += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" -> {detail}" if detail and not ok else ""))
    total = len(results)
    print(f"\nADAPTER_2575_SELFTEST: {'PASS' if not failures else 'FAIL'} "
          f"({total - failures}/{total} checks)")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
