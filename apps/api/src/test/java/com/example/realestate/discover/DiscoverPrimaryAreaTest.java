package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pure unit tests for {@link DiscoverPrimaryArea} — the (family, subtype/property_type) → primary
 * area meaning + disclosed buyer label mapping (#2459 Step 1). No Spring context.
 */
class DiscoverPrimaryAreaTest {

    // ── AC1: dwellings are BUILT-UP, and deliberately NOT carpet ────────────────────────────────

    @Test
    void dwellings_resolveToBuiltUpWithBuiltUpLabel() {
        for (String type : List.of("apartment", "villa", "house")) {
            assertEquals(DiscoverPrimaryArea.BUILT_UP, DiscoverPrimaryArea.resolve(type, null), type);
        }
        assertEquals("BUILT-UP AREA (SQ FT)", DiscoverPrimaryArea.BUILT_UP.buyerLabel());
        assertEquals("built_area", DiscoverPrimaryArea.BUILT_UP.areaColumn());
        assertEquals("built_area_unit", DiscoverPrimaryArea.BUILT_UP.unitColumn());
    }

    @Test
    void noMeaningReadsCarpetArea_theAc1RulingIsStructural() {
        // The AC1 ruling ("do NOT add a carpet-area projection") is enforced here rather than left
        // to review: if someone adds a CARPET meaning or repoints a meaning at carpet_area, this
        // fails. 0 of 1,916 live dwellings carry a carpet_area value.
        for (DiscoverPrimaryArea meaning : DiscoverPrimaryArea.values()) {
            assertFalse("CARPET".equals(meaning.name()), "no CARPET meaning may exist");
            if (meaning.isResolved()) {
                assertFalse(meaning.areaColumn().contains("carpet"),
                        meaning + " must not read a carpet column");
            }
        }
    }

    // ── AC2/AC3: plots, shops/offices/buildings, warehouses, commercial land ────────────────────

    @Test
    void plotsAndLand_resolveToPlotSize() {
        for (String type : List.of("residential_plot", "land", "commercial_land", "agricultural_land")) {
            assertEquals(DiscoverPrimaryArea.PLOT, DiscoverPrimaryArea.resolve(type, null), type);
        }
        assertEquals("PLOT SIZE (SQ FT)", DiscoverPrimaryArea.PLOT.buyerLabel());
        assertEquals("land_area", DiscoverPrimaryArea.PLOT.areaColumn());
        assertEquals("land_area_unit", DiscoverPrimaryArea.PLOT.unitColumn());
    }

    @Test
    void shopOfficeAndBuilding_resolveToBuiltUp() {
        assertEquals(DiscoverPrimaryArea.BUILT_UP, DiscoverPrimaryArea.resolve("commercial", "SHOP"));
        assertEquals(DiscoverPrimaryArea.BUILT_UP, DiscoverPrimaryArea.resolve("commercial", "OFFICE"));
        assertEquals(DiscoverPrimaryArea.BUILT_UP,
                DiscoverPrimaryArea.resolve("commercial_building", null));
    }

    @Test
    void warehouse_resolvesToWarehouseAreaWithItsOwnLabel() {
        assertEquals(DiscoverPrimaryArea.WAREHOUSE, DiscoverPrimaryArea.resolve("warehouse", null));
        assertEquals("WAREHOUSE AREA (SQ FT)", DiscoverPrimaryArea.WAREHOUSE.buyerLabel());
        // Same column pair as BUILT_UP, distinct meaning — the label is what differs (AC3/D1).
        assertEquals(DiscoverPrimaryArea.BUILT_UP.areaColumn(),
                DiscoverPrimaryArea.WAREHOUSE.areaColumn());
        assertFalse(DiscoverPrimaryArea.WAREHOUSE.buyerLabel()
                .equals(DiscoverPrimaryArea.BUILT_UP.buyerLabel()));
    }

    @Test
    void commercialLandSubtype_resolvesToPlotSize() {
        assertEquals(DiscoverPrimaryArea.PLOT, DiscoverPrimaryArea.resolve("commercial_land", "LAND"));
    }

    @Test
    void resolutionIsCaseInsensitiveOnBothAxes() {
        assertEquals(DiscoverPrimaryArea.BUILT_UP, DiscoverPrimaryArea.resolve("  APARTMENT ", null));
        assertEquals(DiscoverPrimaryArea.BUILT_UP, DiscoverPrimaryArea.resolve("commercial", " shop "));
    }

    // ── The convergence rule (owner ruling, adopted post-approval) ──────────────────────────────

    @Test
    void nullSubtypeCommercial_convergesOnBuiltUpWithoutInferringASubtype() {
        // Both admissible interpretations (SHOP, OFFICE) mean BUILT-UP, so the MEANING is resolved
        // even though the SUBTYPE is not. This is the owner's adopted rule, not subtype inference.
        assertEquals(Set.of("SHOP", "OFFICE"), DiscoverPrimaryArea.admissibleSubtypes("commercial"));
        assertEquals(DiscoverPrimaryArea.BUILT_UP, DiscoverPrimaryArea.resolve("commercial", null));
    }

    @Test
    void nonConvergingAdmissibleSet_staysUnresolved() {
        // The GENERAL rule, exercised directly: the moment a type's admissible subtypes disagree on
        // the area semantic, the answer is UNRESOLVED again — with no code change. No such type
        // exists in today's taxonomy, which is exactly why this branch needs a deliberate test.
        assertEquals(DiscoverPrimaryArea.UNRESOLVED,
                DiscoverPrimaryArea.resolveFromAdmissibleSubtypes(Set.of("SHOP", "LAND")));
        assertEquals(DiscoverPrimaryArea.UNRESOLVED,
                DiscoverPrimaryArea.resolveFromAdmissibleSubtypes(Set.of("WAREHOUSE", "OFFICE")));
    }

    @Test
    void convergingAdmissibleSet_resolvesWithoutPickingAMember() {
        assertEquals(DiscoverPrimaryArea.BUILT_UP,
                DiscoverPrimaryArea.resolveFromAdmissibleSubtypes(Set.of("SHOP", "OFFICE", "BUILDING")));
    }

    @Test
    void emptyOrUnknownAdmissibleSet_isUnresolved() {
        assertEquals(DiscoverPrimaryArea.UNRESOLVED,
                DiscoverPrimaryArea.resolveFromAdmissibleSubtypes(Set.of()));
        assertEquals(DiscoverPrimaryArea.UNRESOLVED,
                DiscoverPrimaryArea.resolveFromAdmissibleSubtypes(Set.of("MARINA")));
    }

    // ── UNRESOLVED ─────────────────────────────────────────────────────────────────────────────

    @Test
    void otherAndUnknownTypes_areUnresolvedAndCarryNoLabel() {
        assertEquals(DiscoverPrimaryArea.UNRESOLVED, DiscoverPrimaryArea.resolve("other", null));
        assertEquals(DiscoverPrimaryArea.UNRESOLVED, DiscoverPrimaryArea.resolve("penthouse", null));
        assertEquals(DiscoverPrimaryArea.UNRESOLVED, DiscoverPrimaryArea.resolve(null, null));
        assertEquals(DiscoverPrimaryArea.UNRESOLVED, DiscoverPrimaryArea.resolve("  ", null));
        assertNull(DiscoverPrimaryArea.UNRESOLVED.buyerLabel());
        assertNull(DiscoverPrimaryArea.UNRESOLVED.areaColumn());
        assertFalse(DiscoverPrimaryArea.UNRESOLVED.isResolved());
    }

    @Test
    void unrecognisedSubtypeDoesNotOverrideTheTypesOwnConvergence() {
        // A junk subtype on a commercial row must not produce a DIFFERENT answer from a null one:
        // both fall through to the admissible-set rule.
        assertEquals(DiscoverPrimaryArea.resolve("commercial", null),
                DiscoverPrimaryArea.resolve("commercial", "MARINA"));
    }

    @Test
    void everyStoredPropertyTypeHasADefinedAnswer() {
        // No stored type may fall off the map silently — each is either mapped or explicitly
        // UNRESOLVED, and every resolved one carries a disclosable label (D1).
        for (PropertyType pt : PropertyType.values()) {
            DiscoverPrimaryArea meaning = DiscoverPrimaryArea.resolve(pt.getValue(), null);
            assertNotNull(meaning, pt.getValue());
            if (meaning.isResolved()) {
                assertNotNull(meaning.buyerLabel(), pt.getValue() + " must disclose a label");
            }
        }
    }

    // ── Column grouping — the shape both engines enumerate ──────────────────────────────────────

    @Test
    void columnGroups_coverEveryResolvedTypeExactlyOnce() {
        List<DiscoverPrimaryArea.ColumnGroup> groups = DiscoverPrimaryArea.columnGroups();
        assertEquals(2, groups.size(), "one group per DISTINCT column pair");

        List<String> built = groups.stream()
                .filter(g -> "built_area".equals(g.areaColumn()))
                .findFirst().orElseThrow().propertyTypes();
        assertEquals(List.of("apartment", "commercial", "commercial_building", "house", "villa",
                "warehouse"), built);

        List<String> land = groups.stream()
                .filter(g -> "land_area".equals(g.areaColumn()))
                .findFirst().orElseThrow().propertyTypes();
        assertEquals(List.of("agricultural_land", "commercial_land", "land", "residential_plot"),
                land);

        // `other` appears in NO group — that is what makes it UNRESOLVED on both engines.
        assertFalse(built.contains("other"));
        assertFalse(land.contains("other"));
    }

    // ── SQL projection ─────────────────────────────────────────────────────────────────────────

    @Test
    void primaryAreaSqftSql_readsTheRightColumnPerMeaningAndBindsNothing() {
        String sql = DiscoverPrimaryArea.primaryAreaSqftSql("pl");

        assertFalse(sql.contains("?"), "the expression must bind NOTHING so it cannot reorder "
                + "a caller's positional parameters");
        assertTrue(sql.contains("pl.built_area"));
        assertTrue(sql.contains("pl.built_area_unit"));
        assertTrue(sql.contains("pl.land_area"));
        assertTrue(sql.contains("pl.land_area_unit"));
        assertFalse(sql.contains("carpet"), "AC1: carpet_area is projected nowhere");
        assertTrue(sql.contains("ELSE NULL END)"), "unresolved rows must evaluate to NULL");
        // every recognised unit reachable
        assertTrue(sql.contains("WHEN 'sqm' THEN"));
        assertTrue(sql.contains("WHEN 'acre' THEN"));
        assertTrue(sql.contains("WHEN 'cent' THEN"));
        assertTrue(sql.contains("WHEN 'gunta' THEN"));
    }

    @Test
    void primaryAreaSqftSql_isDeterministic() {
        assertEquals(DiscoverPrimaryArea.primaryAreaSqftSql("pl"),
                DiscoverPrimaryArea.primaryAreaSqftSql("pl"));
    }
}
