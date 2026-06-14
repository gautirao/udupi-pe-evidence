package com.example.realestate.discover.shadow;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsQuery;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ShadowQueryType}.
 */
class ShadowQueryTypeTest {

    // ---- fromListingsQuery classification ----

    @Test
    void keyword_whenQIsNonBlank() {
        DiscoverListingsQuery query = queryWith("test", null, null, null, null);
        assertThat(ShadowQueryType.fromListingsQuery(query)).isEqualTo(ShadowQueryType.KEYWORD);
    }

    @Test
    void schoolRadius_whenAllSchoolParamsPresent() {
        DiscoverListingsQuery query = queryWith(null, 13.0, 74.0, 5.0, null);
        assertThat(ShadowQueryType.fromListingsQuery(query)).isEqualTo(ShadowQueryType.SCHOOL_RADIUS);
    }

    @Test
    void polygon_whenPolygonPresent() {
        List<List<Double>> polygon = List.of(
                List.of(13.0, 74.0), List.of(13.1, 74.1), List.of(13.0, 74.0));
        DiscoverListingsQuery query = queryWith(null, null, null, null, polygon);
        assertThat(ShadowQueryType.fromListingsQuery(query)).isEqualTo(ShadowQueryType.POLYGON);
    }

    @Test
    void bbox_whenBboxPresent() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.0, 74.0, 13.1, 74.1);
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null,
                null, bbox, 0, 20, false, null);
        assertThat(ShadowQueryType.fromListingsQuery(query)).isEqualTo(ShadowQueryType.BBOX);
    }

    @Test
    void cityBrowse_whenNonePresent() {
        DiscoverListingsQuery query = queryWith(null, null, null, null, null);
        assertThat(ShadowQueryType.fromListingsQuery(query)).isEqualTo(ShadowQueryType.CITY_BROWSE);
    }

    @Test
    void keyword_takesPresenceOverBbox() {
        // q + bbox — KEYWORD wins (higher precedence)
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.0, 74.0, 13.1, 74.1);
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null,
                "cafe", bbox, 0, 20, false, null);
        assertThat(ShadowQueryType.fromListingsQuery(query)).isEqualTo(ShadowQueryType.KEYWORD);
    }

    // ---- isOrdered ----

    @Test
    void keyword_isOrdered() {
        assertThat(ShadowQueryType.KEYWORD.isOrdered()).isTrue();
    }

    @Test
    void markers_isNotOrdered() {
        assertThat(ShadowQueryType.MARKERS.isOrdered()).isFalse();
    }

    @Test
    void cityBrowse_isOrdered() {
        assertThat(ShadowQueryType.CITY_BROWSE.isOrdered()).isTrue();
    }

    @Test
    void bbox_isOrdered() {
        assertThat(ShadowQueryType.BBOX.isOrdered()).isTrue();
    }

    @Test
    void schoolRadius_isOrdered() {
        assertThat(ShadowQueryType.SCHOOL_RADIUS.isOrdered()).isTrue();
    }

    @Test
    void polygon_isOrdered() {
        assertThat(ShadowQueryType.POLYGON.isOrdered()).isTrue();
    }

    // ---- helper ----

    private DiscoverListingsQuery queryWith(
            String q,
            Double schoolLat, Double schoolLon, Double schoolRadiusKm,
            List<List<Double>> polygon) {
        return new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null,
                polygon, schoolLat, schoolLon, schoolRadiusKm,
                q, null, 0, 20, false, null);
    }
}
