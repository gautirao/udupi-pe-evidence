"""Unit tests for adapter_agricultural.py (#2607).

Uses only SYNTHETIC fixture rows — no real scraped data exists for the 34 deferred
Agricultural records (verified absent from the tree; see the adapter module docstring
and the PR body for the evidence). These tests prove the validation CONTRACT: what the
adapter does when given a shape, not what it did to any real capture.
"""

import unittest

from adapter_agricultural import build_candidate


def _base_record(**overrides):
    record = {
        "sourceListingId": "AGRI-1",
        "sourceUrl": "https://housing.com/agricultural/example-cpid-1",
        "propertySignalCategory": "AGRICULTURAL",
        "propertySignalSubtype": "AGRICULTURAL_LAND",
        "purpose": "SALE",
        "price": 500000,
        "areaValue": 2.5,
        "areaUnit": "acre",
        "areaType": "Plot Area",
        "latitude": 13.3409,
        "longitude": 74.7421,
        "city": "Udupi",
        "locality": "Example Locality",
        "title": "Agricultural land parcel",
    }
    record.update(overrides)
    return record


class BuildCandidateHappyPathTests(unittest.TestCase):
    def test_valid_agricultural_land_row_is_staged(self):
        candidate, reject = build_candidate(_base_record())
        self.assertIsNone(reject)
        self.assertEqual(candidate["agricultural_subtype"], "AGRICULTURAL_LAND")
        self.assertEqual(candidate["property_family"], "AGRICULTURAL")
        self.assertEqual(candidate["area_type"], "Plot Area")
        self.assertEqual(candidate["plot_area"], 2.5)
        # No built-up-area key exists on the candidate at all -- the adapter never
        # even produces one, mirroring V141's absent built_area column.
        self.assertNotIn("built_area", candidate)
        self.assertNotIn("built_area_unit", candidate)

    def test_rent_purpose_keeps_sale_price_columns_null(self):
        candidate, reject = build_candidate(
            _base_record(purpose="RENT", price=15000))
        self.assertIsNone(reject)
        self.assertEqual(candidate["listing_purpose"], "rent")
        self.assertIsNone(candidate["price"])
        self.assertIsNone(candidate["price_paise"])
        self.assertEqual(candidate["monthly_rent"], 15000)


class DiscriminationTests(unittest.TestCase):
    """Proves the adapter-layer half of the discrimination guarantee: a
    Commercial-shaped record can never be routed through the Agricultural adapter and
    staged as Agricultural."""

    def test_commercial_category_is_rejected_not_staged(self):
        candidate, reject = build_candidate(
            _base_record(propertySignalCategory="COMMERCIAL",
                         propertySignalSubtype="COMMERCIAL_BUILDING"))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "category_mismatch")

    def test_commercial_subtype_under_agricultural_category_is_rejected(self):
        # A malformed/adversarial record claiming the AGRICULTURAL category but a
        # Commercial subtype value must still be rejected -- the category check alone
        # is not trusted to be sufficient; the subtype must independently match.
        candidate, reject = build_candidate(
            _base_record(propertySignalSubtype="SHOP"))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "unsupported_agricultural_type")

    def test_every_canonical_commercial_subtype_is_rejected(self):
        for commercial_subtype in ("SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND"):
            with self.subTest(commercial_subtype=commercial_subtype):
                candidate, reject = build_candidate(
                    _base_record(propertySignalSubtype=commercial_subtype))
                self.assertIsNone(candidate)
                self.assertEqual(reject["reject_reason"], "unsupported_agricultural_type")


class BedroomBhkRejectionTests(unittest.TestCase):
    """#2607: bedroom/BHK data must be REJECTED, never silently dropped."""

    def test_bedrooms_field_is_rejected_with_structured_reason(self):
        candidate, reject = build_candidate(_base_record(bedrooms=3))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "BEDROOM_DATA_UNSUPPORTED_FOR_AGRICULTURAL")
        # The evidence survives on the reject -- inspectable, not silently dropped.
        self.assertIn("bedrooms", reject["detail"])

    def test_bhk_field_is_rejected(self):
        candidate, reject = build_candidate(_base_record(bhk=2))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "BEDROOM_DATA_UNSUPPORTED_FOR_AGRICULTURAL")

    def test_numeric_bedroom_field_is_rejected_even_with_agricultural_subtype(self):
        candidate, reject = build_candidate(
            _base_record(propertySignalSubtype="AGRICULTURAL_LAND",
                         numberOfBedrooms=4))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "BEDROOM_DATA_UNSUPPORTED_FOR_AGRICULTURAL")

    def test_bhk_labelled_subtype_text_is_rejected_as_bedroom_not_generic_mismatch(self):
        # The bedroom/BHK gate runs BEFORE the subtype exact-match gate (see
        # build_candidate), so a malformed record whose propertySignalSubtype
        # itself carries a BHK label is rejected with the more informative
        # bedroom reason, not a generic "unsupported_agricultural_type".
        candidate, reject = build_candidate(
            _base_record(propertySignalSubtype="2 BHK Farm House"))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "BEDROOM_DATA_UNSUPPORTED_FOR_AGRICULTURAL")
        self.assertIn("propertySignalSubtype", reject["detail"])

    def test_zero_bedrooms_is_not_treated_as_signal(self):
        # A source that explicitly reports zero bedrooms (a common "not applicable"
        # sentinel) must not spuriously reject a genuine Agricultural row.
        candidate, reject = build_candidate(_base_record(bedrooms=0))
        self.assertIsNone(reject)
        self.assertIsNotNone(candidate)


class AreaTypeTests(unittest.TestCase):
    """#2607: Plot Area only -- never built-up area."""

    def test_built_up_area_type_is_rejected(self):
        candidate, reject = build_candidate(
            _base_record(areaType="Built Up Area"))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "area_type_not_plot")

    def test_super_built_up_area_type_is_rejected(self):
        candidate, reject = build_candidate(
            _base_record(areaType="Super Built Up Area"))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "area_type_not_plot")

    def test_missing_area_type_is_rejected(self):
        candidate, reject = build_candidate(_base_record(areaType=None))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "area_type_not_plot")


class OtherValidationGateTests(unittest.TestCase):
    def test_missing_source_listing_id_is_rejected(self):
        candidate, reject = build_candidate(_base_record(sourceListingId=None))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "missing_source_listing_id")

    def test_missing_coordinates_is_rejected(self):
        candidate, reject = build_candidate(_base_record(latitude=None, longitude=None))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "malformed_source_record")

    def test_out_of_india_coordinates_is_rejected(self):
        candidate, reject = build_candidate(
            _base_record(latitude=40.7128, longitude=-74.0060))  # New York
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "wrong_geography")

    def test_unmapped_purpose_is_rejected(self):
        candidate, reject = build_candidate(_base_record(purpose="LEASE"))
        self.assertIsNone(candidate)
        self.assertEqual(reject["reject_reason"], "malformed_source_record")

    def test_pii_fields_are_stripped_from_raw_payload_on_stage(self):
        candidate, reject = build_candidate(
            _base_record(sellerName="Jane Doe", sellerId="S123"))
        self.assertIsNone(reject)
        self.assertNotIn("sellerName", candidate["raw_payload"])
        self.assertNotIn("sellerId", candidate["raw_payload"])

    def test_pii_fields_are_stripped_from_raw_payload_on_reject(self):
        # Rejects retain evidence but must never retain PII.
        candidate, reject = build_candidate(
            _base_record(bedrooms=3, sellerName="Jane Doe", sellerId="S123"))
        self.assertIsNone(candidate)
        self.assertNotIn("sellerName", reject["raw_payload"])
        self.assertNotIn("sellerId", reject["raw_payload"])


if __name__ == "__main__":
    unittest.main()
