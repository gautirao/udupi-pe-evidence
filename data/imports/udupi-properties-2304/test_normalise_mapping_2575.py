"""Issue #2575: regression tests for 99acres commercial subtype mapping.

Bug: map_commercial_subtype checked PROPERTY_TYPE_TO_SUBTYPE (a property_type -> subtype
fallback) before NINETYNINE_COMMERCIAL_SUBTYPE_MAP (the explicit raw-label mapping). Because
"Ready to move office space" and "Bare shell office space" both mapped property_type to
'commercial_building', that property_type-first short-circuit masked the explicit OFFICE
mapping and silently misclassified both labels as commercial_subtype='BUILDING'.

Fix: the explicit raw-label mapping now takes precedence, and both office labels'
property_type mapping was corrected from 'commercial_building' to 'commercial' so they no
longer collide with the commercial_building/BUILDING fallback at all.

Run with: python3 -m pytest test_normalise_mapping_2575.py -v
"""
import importlib.util
import os

import pytest

_MODULE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "normalise_v2.py")
_spec = importlib.util.spec_from_file_location("normalise_v2", _MODULE_PATH)
normalise_v2 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(normalise_v2)

OFFICE_LABELS = ["Ready to move office space", "Bare shell office space"]


@pytest.mark.parametrize("raw_label", OFFICE_LABELS)
def test_office_labels_resolve_to_commercial_office(raw_label):
    """Both 99acres office labels must resolve to property_type='commercial' and
    commercial_subtype='OFFICE', driven only by the declared propertyType field."""
    property_type, listing_family = normalise_v2.map_commercial_type(raw_label)
    assert property_type == "commercial"
    assert listing_family == "COMMERCIAL"

    subtype = normalise_v2.map_commercial_subtype(property_type, raw_label)
    assert subtype == "OFFICE"


@pytest.mark.parametrize("raw_label", OFFICE_LABELS)
def test_explicit_raw_label_subtype_not_masked_by_property_type_short_circuit(raw_label):
    """Regression guard: even if a caller passes the OLD/buggy property_type value
    ('commercial_building'), the explicit raw-label mapping must still win and produce
    OFFICE. Under the pre-fix precedence (PROPERTY_TYPE_TO_SUBTYPE checked first), this
    exact call returns 'BUILDING' - so restoring the short-circuit breaks this assertion
    unconditionally, regardless of the NINETYNINE_COMMERCIAL_TYPE_MAP data fix above."""
    subtype = normalise_v2.map_commercial_subtype("commercial_building", raw_label)
    assert subtype == "OFFICE"


def test_property_type_fallback_still_applies_when_no_explicit_label_mapping():
    """Labels with no entry in NINETYNINE_COMMERCIAL_SUBTYPE_MAP must still fall back to
    PROPERTY_TYPE_TO_SUBTYPE - the fix must not remove the fallback path entirely."""
    assert normalise_v2.map_commercial_subtype("warehouse", "Ware House") == "WAREHOUSE"
    assert normalise_v2.map_commercial_subtype("commercial_land", "Commercial Land/Inst. Land") == "LAND"


def test_shop_labels_unaffected():
    """Shop/showroom labels were already correct pre-fix and must remain unaffected by the
    precedence reorder."""
    assert normalise_v2.map_commercial_subtype("commercial", "Commercial Shops") == "SHOP"
    assert normalise_v2.map_commercial_subtype("commercial", "Commercial Showrooms") == "SHOP"


# Raw labels for which NINETYNINE_COMMERCIAL_SUBTYPE_MAP and PROPERTY_TYPE_TO_SUBTYPE are
# allowed to disagree, because the disagreement is intended rather than drift. Add an entry
# here (with a comment explaining why) only for a deliberate, reviewed exception - never to
# silence the check below.
#
# Empty today, and READ THE NEXT SENTENCE BEFORE TREATING THIS TEST AS COVERAGE. As of the
# #2575 fix, all four labels in NINETYNINE_COMMERCIAL_SUBTYPE_MAP declare
# property_type='commercial', and PROPERTY_TYPE_TO_SUBTYPE has no 'commercial' entry (it holds
# only commercial_building / warehouse / commercial_land). Every label therefore takes the
# "fallback_subtype is None" branch: the subtype-agreement assertion below is reached 0 times
# out of 4 on the current data. Measured, not assumed.
#
# So this test is a GUARD against reintroduction, not a check that currently compares
# anything. What executes today is the NINETYNINE_COMMERCIAL_TYPE_MAP presence assertion
# (4 times). What does not execute today is the subtype-agreement assertion. That is the
# intended end state - the fix works by moving every explicit-subtype label OFF a
# self-describing property_type, so nothing is left to collide - but it means a green run
# here is not evidence the agreement check works. That evidence comes from having observed
# it fail: reverting both office labels' property_type to 'commercial_building' (the pre-fix
# data) makes the fallback resolve to BUILDING against an explicit OFFICE, and the assertion
# fires on both labels.
KNOWN_LEGITIMATE_SUBTYPE_CONTRADICTIONS = set()


def test_explicit_subtype_map_agrees_with_property_type_fallback():
    """Map-agreement invariant (#2575 code review): the bug class here is not "office labels
    are wrong" but "the two subtype-resolving tables can silently disagree about the same
    underlying listing, and whichever one the precedence rule happens to consult first wins".
    The label-level regression tests above pin the specific office-label fix; they say nothing
    about whether some OTHER label could drift into the same collision later (e.g. if a future
    edit gives an explicit-subtype label a property_type that also has a PROPERTY_TYPE_TO_SUBTYPE
    entry disagreeing with its explicit subtype).

    For every raw label that has an explicit entry in NINETYNINE_COMMERCIAL_SUBTYPE_MAP, this
    resolves that label's OWN declared property_type (via NINETYNINE_COMMERCIAL_TYPE_MAP) and
    checks what PROPERTY_TYPE_TO_SUBTYPE would derive from it. If the fallback table has no
    entry for that property_type there is no possible collision (nothing to disagree). If it
    does have an entry, it must agree with the explicit subtype - a disagreement is exactly the
    #2575 bug class, and is only acceptable if the label is deliberately listed in
    KNOWN_LEGITIMATE_SUBTYPE_CONTRADICTIONS above.
    """
    for raw_label, explicit_subtype in normalise_v2.NINETYNINE_COMMERCIAL_SUBTYPE_MAP.items():
        assert raw_label in normalise_v2.NINETYNINE_COMMERCIAL_TYPE_MAP, (
            f"{raw_label!r} has an explicit commercial_subtype entry but no entry in "
            "NINETYNINE_COMMERCIAL_TYPE_MAP - map-agreement check cannot resolve its "
            "property_type to evaluate for a collision"
        )
        declared_property_type, _family = normalise_v2.NINETYNINE_COMMERCIAL_TYPE_MAP[raw_label]
        fallback_subtype = normalise_v2.PROPERTY_TYPE_TO_SUBTYPE.get(declared_property_type)
        if fallback_subtype is None:
            continue  # fallback table has no opinion on this property_type - no collision possible
        if raw_label in KNOWN_LEGITIMATE_SUBTYPE_CONTRADICTIONS:
            continue
        assert fallback_subtype == explicit_subtype, (
            f"{raw_label!r}: NINETYNINE_COMMERCIAL_SUBTYPE_MAP says {explicit_subtype!r} but its "
            f"declared property_type {declared_property_type!r} resolves to {fallback_subtype!r} "
            "via PROPERTY_TYPE_TO_SUBTYPE - the two mapping tables disagree about this label, "
            "which is the #2575 bug class (whichever table the precedence check consults first "
            "silently wins and masks the other). If this disagreement is intentional, add "
            f"{raw_label!r} to KNOWN_LEGITIMATE_SUBTYPE_CONTRADICTIONS with a comment explaining "
            "why; otherwise fix the offending table entry."
        )


def test_explicit_subtype_map_agreement_check_actually_raises_on_a_real_contradiction(monkeypatch):
    """Falsifiability guard for the invariant above (code review follow-up): on current data,
    test_explicit_subtype_map_agrees_with_property_type_fallback never reaches its own
    agreement assertion (see the comment above KNOWN_LEGITIMATE_SUBTYPE_CONTRADICTIONS - 0 of 4
    labels have a colliding fallback entry). A test that can never observe its own assertion
    fail is not proof the assertion works. This test manufactures a real contradiction and
    confirms the check fires and names the offending label.

    monkeypatch.setattr restores the real PROPERTY_TYPE_TO_SUBTYPE after this test regardless
    of outcome, so normalise_v2's production table is never left mutated for later tests.
    """
    contradicting_fallback_map = dict(normalise_v2.PROPERTY_TYPE_TO_SUBTYPE)
    contradicting_fallback_map["commercial"] = "SHOP"  # contradicts the explicit OFFICE labels
    monkeypatch.setattr(normalise_v2, "PROPERTY_TYPE_TO_SUBTYPE", contradicting_fallback_map)

    with pytest.raises(AssertionError) as excinfo:
        test_explicit_subtype_map_agrees_with_property_type_fallback()

    message = str(excinfo.value)
    assert "Ready to move office space" in message, (
        "expected the agreement check to fail on the first colliding label "
        f"('Ready to move office space'); got: {message}"
    )
    assert "OFFICE" in message and "SHOP" in message, (
        f"expected the failure message to name both the explicit subtype (OFFICE) and the "
        f"contradicting fallback (SHOP); got: {message}"
    )
