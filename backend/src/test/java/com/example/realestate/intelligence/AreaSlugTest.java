package com.example.realestate.intelligence;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link AreaSlug#slugify(String)}.
 *
 * <p>These vectors are SHARED with the frontend test suite — the frontend mirror must
 * produce identical output for each input using String.normalize('NFKD') + Unicode regex
 * + the same replacement steps. If a vector here changes, the FE suite must be updated too.
 *
 * <p>Naming convention: each test is prefixed with the shared vector ID so the FE test
 * author can cross-reference by name.
 */
class AreaSlugTest {

    // ── Shared vectors ────────────────────────────────────────────────────────

    /**
     * SV-01: plain ASCII label, single word.
     * "Malpe" -> "malpe"
     */
    @Test
    @DisplayName("SV-01: 'Malpe' -> 'malpe'")
    void sv01_simpleSingleWord() {
        assertThat(AreaSlug.slugify("Malpe")).isEqualTo("malpe");
    }

    /**
     * SV-02: two-word ASCII label with space.
     * "Udupi Town" -> "udupi-town"
     */
    @Test
    @DisplayName("SV-02: 'Udupi Town' -> 'udupi-town'")
    void sv02_twoWordLabel() {
        assertThat(AreaSlug.slugify("Udupi Town")).isEqualTo("udupi-town");
    }

    /**
     * SV-03: three-word ASCII label with spaces.
     * "Malpe Beach Road" -> "malpe-beach-road"
     */
    @Test
    @DisplayName("SV-03: 'Malpe Beach Road' -> 'malpe-beach-road'")
    void sv03_threeWordLabel() {
        assertThat(AreaSlug.slugify("Malpe Beach Road")).isEqualTo("malpe-beach-road");
    }

    /**
     * SV-04: diacritic — acute accent over 'e'.
     * NFKD decomposes 'é' into 'e' + combining acute accent (U+0301);
     * strip M strips the combining mark; result is plain 'e'.
     * "Malpé" -> "malpe"
     */
    @Test
    @DisplayName("SV-04: diacritic 'Malpé' -> 'malpe'")
    void sv04_diacriticLabel() {
        assertThat(AreaSlug.slugify("Malpé")).isEqualTo("malpe");
    }

    /**
     * SV-05: ligature / NFKD compatibility decomposition.
     * German sharp-s 'ß' (U+00DF) is NOT decomposed by NFKD to 'ss' — it remains
     * as a single char (no compatibility decomposition). After toLowerCase(ROOT) it
     * stays 'ß', which is not [a-z0-9], so it becomes a hyphen. But if the label
     * is entirely 'ß', stripping produces '-' then the leading/trailing trim removes it.
     *
     * <p>To prove the NFKD path matters, we use 'ﬁ' (U+FB01, LATIN SMALL LIGATURE FI)
     * which NFKD decomposes to 'f'+'i' (compatibility decomposition), yielding "fi".
     * Input: "ﬁeld" -> "field"
     */
    @Test
    @DisplayName("SV-05: ligature fi (U+FB01) in 'ﬁeld' -> 'field' via NFKD decomposition")
    void sv05_ligatureFi_nkfdDecomposition() {
        // U+FB01 LATIN SMALL LIGATURE FI  → NFKD → 'f' + 'i'
        assertThat(AreaSlug.slugify("ﬁeld")).isEqualTo("field");
    }

    /**
     * SV-06: all-punctuation input — only non-alphanumeric characters.
     * Each run collapses to one hyphen; leading and trailing hyphens trimmed.
     * "---" -> ""
     */
    @Test
    @DisplayName("SV-06: all-punctuation '---' -> '' (empty after trim)")
    void sv06_allPunctuation_emptyResult() {
        assertThat(AreaSlug.slugify("---")).isEqualTo("");
    }

    /**
     * SV-07: leading and trailing non-alphanumeric characters are trimmed.
     * " Beach Road " -> "beach-road"
     */
    @Test
    @DisplayName("SV-07: leading/trailing spaces trimmed ' Beach Road ' -> 'beach-road'")
    void sv07_leadingTrailingSpaces() {
        assertThat(AreaSlug.slugify(" Beach Road ")).isEqualTo("beach-road");
    }

    /**
     * SV-08: consecutive spaces / punctuation collapse to a single hyphen.
     * "Malpe  Beach" (double space) -> "malpe-beach"
     */
    @Test
    @DisplayName("SV-08: consecutive spaces collapse to single hyphen 'Malpe  Beach' -> 'malpe-beach'")
    void sv08_consecutiveSpacesCollapse() {
        assertThat(AreaSlug.slugify("Malpe  Beach")).isEqualTo("malpe-beach");
    }

    // ── Area-key fallback ────────────────────────────────────────────────────

    /**
     * SV-09 (fallback): null area_label -> slugify last pipe segment of area_key.
     * "IN|KA|Udupi|Malpe" -> "malpe"
     */
    @Test
    @DisplayName("SV-09 (fallback): area_label null, areaKey 'IN|KA|Udupi|Malpe' -> 'malpe'")
    void sv09_areaKeyFallback_lastSegment() {
        assertThat(AreaSlug.slugifyFromAreaKey("IN|KA|Udupi|Malpe")).isEqualTo("malpe");
    }

    /**
     * SV-10 (fallback): last segment with spaces.
     * "IN|KA|Udupi|Udupi Town" -> "udupi-town"
     */
    @Test
    @DisplayName("SV-10 (fallback): area_label null, areaKey last segment 'Udupi Town' -> 'udupi-town'")
    void sv10_areaKeyFallback_lastSegmentWithSpace() {
        assertThat(AreaSlug.slugifyFromAreaKey("IN|KA|Udupi|Udupi Town")).isEqualTo("udupi-town");
    }

    // ── Determinism ───────────────────────────────────────────────────────────

    /**
     * Locale independence: slugify must produce the same result regardless of the
     * JVM default locale. Turkish 'I' would lowercase to 'ı' under tr_TR locale but
     * Locale.ROOT keeps it as 'i'.
     */
    @Test
    @DisplayName("Locale independence: 'ISTANBUL' -> 'istanbul' (not 'ıstanbul' under TR locale)")
    void localeIndependence_upperCaseI() {
        assertThat(AreaSlug.slugify("ISTANBUL")).isEqualTo("istanbul");
    }
}
