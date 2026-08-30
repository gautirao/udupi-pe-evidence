package com.example.realestate.discover;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for {@link BboxParser} — the single validation gate for the optional
 * {@code bbox=south,west,north,east} query parameter on both discover endpoints.
 *
 * <p>No Spring context needed; BboxParser is a pure static utility.
 */
class BboxParserTest {

    // ── 1. Valid bbox → returns populated Bbox record ────────────────────────

    @Test
    void parse_validInput_returnsBbox() {
        DiscoverListingPredicateBuilder.Bbox bbox = BboxParser.parse("13.3,74.7,13.4,74.8");

        assertNotNull(bbox);
        assertEquals(13.3, bbox.south(), 1e-9);
        assertEquals(74.7, bbox.west(),  1e-9);
        assertEquals(13.4, bbox.north(), 1e-9);
        assertEquals(74.8, bbox.east(),  1e-9);
    }

    // ── 2. null / blank input → returns null (param is optional) ────────────

    @Test
    void parse_nullInput_returnsNull() {
        assertNull(BboxParser.parse(null));
    }

    @Test
    void parse_blankInput_returnsNull() {
        assertNull(BboxParser.parse("   "));
    }

    // ── 3. Non-numeric token → 400 with bbox error code ─────────────────────

    @Test
    void parse_nonNumericToken_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.3,bad,13.4,74.8")
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 4. NaN / Infinity token → 400 (parseDouble accepts "NaN"/"Infinity"
    //       silently; isFinite() catches it) ──────────────────────────────────

    @Test
    void parse_nanToken_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("NaN,74.7,13.4,74.8")
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    @Test
    void parse_infinityToken_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("Infinity,74.7,13.4,74.8")
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 5. south > north → 400 ───────────────────────────────────────────────

    @Test
    void parse_southGreaterThanNorth_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.5,74.7,13.3,74.8")  // south=13.5 > north=13.3
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 6. west > east → 400 (antimeridian not supported in MVP) ────────────

    @Test
    void parse_westGreaterThanEast_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.3,74.9,13.4,74.7")  // west=74.9 > east=74.7
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 7. latitude out of range → 400 ──────────────────────────────────────

    @Test
    void parse_latOutOfRange_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.3,74.7,91.0,74.8")  // north=91 > 90
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 8. longitude out of range → 400 ─────────────────────────────────────

    @Test
    void parse_lonOutOfRange_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.3,181.0,13.4,74.8")  // west=181 > 180
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 9. Fewer than 4 tokens → 400 ────────────────────────────────────────

    @Test
    void parse_tooFewTokens_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.3,74.7,13.4")  // only 3 values
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 10. south == north (degenerate point bbox) → valid ──────────────────

    @Test
    void parse_southEqualsNorth_returnsDegenerate() {
        // south == north is allowed (point bbox); west < east is still required
        DiscoverListingPredicateBuilder.Bbox bbox = BboxParser.parse("13.3,74.7,13.3,74.8");
        assertNotNull(bbox);
        assertEquals(13.3, bbox.south(), 1e-9);
        assertEquals(13.3, bbox.north(), 1e-9);
    }

    // ── 11. Negative out-of-range lat (south < -90) → 400 ───────────────────

    @Test
    void parse_negativeLatOutOfRange_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("-91.0,74.7,13.4,74.8")  // south=-91 < -90
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 12. Negative out-of-range lon (east < -180) → 400 ───────────────────

    @Test
    void parse_negativeLonOutOfRange_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.3,-181.0,13.4,74.8")  // west=-181 < -180
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }

    // ── 13. Too many tokens (5 values) → 400 ────────────────────────────────

    @Test
    void parse_tooManyTokens_throws400() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> BboxParser.parse("13.3,74.7,13.4,74.8,99.0")  // 5 values
        );
        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason() != null && ex.getReason().contains("bbox"),
                "Error reason should mention bbox, got: " + ex.getReason());
    }
}
