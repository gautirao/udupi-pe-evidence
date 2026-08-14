package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/**
 * Unit tests for {@link DiscoverAgriMapListingsService}.
 *
 * <p>#2151 PR B: this service is now a COMPOSER over {@link AgriDestinationPort} — no more direct
 * JDBC. Tests mock the port instead of {@code JdbcOperations}: validation, the single canonical
 * {@code areaKey} (legacy {@code areaKeys[]} REMOVED in PR C — see the oq_c3 tests below), anon
 * projection (#1454/#1551), and {@code truncated} derivation from the port's {@code hasMore}.
 */
@ExtendWith(MockitoExtension.class)
class DiscoverAgriMapListingsServiceTest {

    @Mock
    private AgriDestinationPort agriDestinationPort;

    private DiscoverAgriMapListingsService service;

    @BeforeEach
    void setUp() {
        service = new DiscoverAgriMapListingsService(agriDestinationPort);
    }

    // ── valid request: returns port-supplied listings, mapped field-for-field ────────────────────

    @Test
    void findAgriMapListings_returnsAgriListingsForCity() {
        AgriDestinationPort.AgriParcel parcel = parcel("id-1", "2.5-Acre Farm, Kundapur",
                "IN|KA|Udupi|Area1", 13.3, 74.7, "Kundapur", 5000000L);
        stubParcels(List.of(parcel), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), true, null);

        assertThat(resp.city()).isEqualTo("udupi");
        assertThat(resp.listings()).hasSize(1);
        assertThat(resp.truncated()).isFalse();
        assertThat(resp.limit()).isEqualTo(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
        AgriMapListingItem returned = resp.listings().get(0);
        assertThat(returned.id()).isEqualTo("id-1");
        assertThat(returned.propertyType()).isEqualTo("agricultural_land");
    }

    // ── city slug normalised to lowercase in response ─────────────────────────────────────────

    @Test
    void findAgriMapListings_cityNormalisedToLowercase() {
        stubParcels(List.of(), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "UDUPI", "IN|KA|Udupi|Area1", Optional.empty(), true, null);

        assertThat(resp.city()).isEqualTo("udupi");
    }

    // ── 400: blank/null citySlug ────────────────────────────────────────────────────────────────

    @Test
    void findAgriMapListings_blankCity_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "  ", "IN|KA|Udupi|Area1", Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    @Test
    void findAgriMapListings_nullCity_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                null, "IN|KA|Udupi|Area1", Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    // ── #2151 PR C, oq_c3: areaKeys[] is REMOVED — a null/blank areaKey is REJECTED with a clear
    //    400, not silently treated as "no scope"/ignored. See findAgriMapListings javadoc for the
    //    ruled reasoning. This is the case a legacy caller (still sending only areaKeys[], not yet
    //    cut over to areaKey) now hits — the controller never binds areaKeys to anything, so it
    //    arrives here as a plain null.

    @Test
    void findAgriMapListings_nullAreaKey_legacyAreaKeysCallerRejectedWith400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", null, Optional.empty(), true, null))
                .as("oq_c3: a legacy areaKeys-only caller (areaKey arrives null) must be rejected, "
                        + "not silently ignored")
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    @Test
    void findAgriMapListings_blankAreaKey_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", "   ", Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    @Test
    void findAgriMapListings_nullAreaKey_400MessageIsClearNotGeneric() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", null, Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getReason())
                        .as("oq_c3: the 400 message must name the removed legacy param, not just "
                                + "'invalid request', so a caller debugging a sudden 400 can find the cause")
                        .isEqualTo("area_key_required_legacy_area_keys_param_removed"));
    }

    // ── canonical areaKey resolution (#2151 PR C) ──────────────────────────────────────────────

    @Test
    void findAgriMapListings_canonicalAreaKey_resolvesToSingletonList() {
        stubParcels(List.of(), false);

        service.findAgriMapListings("udupi", "IN|KA|Udupi|Area1", Optional.empty(), true, null);

        ArgumentCaptor<AgriDestinationPort.ParcelQuery> captor =
                ArgumentCaptor.forClass(AgriDestinationPort.ParcelQuery.class);
        verify(agriDestinationPort).findParcels(captor.capture());
        assertThat(captor.getValue().areaKeys()).containsExactly("IN|KA|Udupi|Area1");
    }

    // ── truncated derived from port hasMore ───────────────────────────────────────────────────

    @Test
    void findAgriMapListings_portHasMoreTrue_responseTruncatedTrue() {
        AgriDestinationPort.AgriParcel parcel = parcel("id-1", "Farm", "IN|KA|Udupi|Area1",
                13.3, 74.7, "Shirva", 1000000L);
        stubParcels(List.of(parcel), true);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), true, null);

        assertThat(resp.truncated()).isTrue();
        assertThat(resp.limit()).isEqualTo(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
    }

    // ── 400: malformed bbox ─────────────────────────────────────────────────────────────────────

    @Test
    void findAgriMapListings_malformedBbox_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.of("not,a,valid"), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    // ── valid bbox: translated into the port's GeoBox ─────────────────────────────────────────

    @Test
    void findAgriMapListings_validBbox_translatedToPortViewport() {
        stubParcels(List.of(), false);

        service.findAgriMapListings("udupi", "IN|KA|Udupi|Area1",
                Optional.of("13.0,74.0,14.0,75.0"), true, null); // south,west,north,east

        ArgumentCaptor<AgriDestinationPort.ParcelQuery> captor =
                ArgumentCaptor.forClass(AgriDestinationPort.ParcelQuery.class);
        verify(agriDestinationPort).findParcels(captor.capture());
        AgriDestinationPort.GeoBox viewport = captor.getValue().viewport();
        assertThat(viewport).isNotNull();
        assertThat(viewport.south()).isEqualTo(13.0);
        assertThat(viewport.west()).isEqualTo(74.0);
        assertThat(viewport.north()).isEqualTo(14.0);
        assertThat(viewport.east()).isEqualTo(75.0);
    }

    // ── empty result: not an error ─────────────────────────────────────────────────────────────

    @Test
    void findAgriMapListings_noMatchingListings_returnsEmpty() {
        stubParcels(List.of(), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), true, null);

        assertThat(resp.listings()).isEmpty();
        assertThat(resp.city()).isEqualTo("udupi");
    }

    // ── listingPurpose passed through to the port's filters ──────────────────────────────────

    @Test
    void findAgriMapListings_listingPurposeRent_passedToPortFilters() {
        stubParcels(List.of(), false);

        service.findAgriMapListings("udupi", "IN|KA|Udupi|Area1",
                Optional.empty(), true, "rent");

        ArgumentCaptor<AgriDestinationPort.ParcelQuery> captor =
                ArgumentCaptor.forClass(AgriDestinationPort.ParcelQuery.class);
        verify(agriDestinationPort).findParcels(captor.capture());
        assertThat(captor.getValue().filters().listingPurpose()).isEqualTo("rent");
    }

    @Test
    void findAgriMapListings_listingPurposeNull_noFilterPassed() {
        stubParcels(List.of(), false);

        service.findAgriMapListings("udupi", "IN|KA|Udupi|Area1",
                Optional.empty(), true, null);

        ArgumentCaptor<AgriDestinationPort.ParcelQuery> captor =
                ArgumentCaptor.forClass(AgriDestinationPort.ParcelQuery.class);
        verify(agriDestinationPort).findParcels(captor.capture());
        assertThat(captor.getValue().filters().listingPurpose()).isNull();
    }

    // ── response fields: no PII fields on AgriMapListingItem ──────────────────────────────────

    @Test
    void agriMapListingItem_hasNoSellerOrAdminFields() {
        AgriMapListingItem item = new AgriMapListingItem(
                "id", "Test Agri Title", "area", 1.0, 2.0, "agricultural_land", "loc",
                "{}", new BigDecimal("1.0"), "acres", new BigDecimal("1.0"), 100L, "sale",
                "borewell", "wetland", true, false,
                "PAVED", "RED_LATERITE", "CULTIVATED", "SINGLE_OWNER",
                OffsetDateTime.of(2025, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC));

        assertThat(item.id()).isNotNull();
        assertThat(item.pricePaise()).isNotNull();
        assertThat(AgriMapListingItem.class.getRecordComponents()).hasSize(22);

        var fieldNames = java.util.Arrays.stream(AgriMapListingItem.class.getRecordComponents())
                .map(c -> c.getName().toLowerCase())
                .toList();
        assertThat(fieldNames).doesNotContain("surveynumber");
        assertThat(fieldNames).doesNotContain("seller", "owner", "phone", "email",
                "rejectionreason", "internalnotes", "adminstatus",
                "archivedat", "isduplicate", "status");
    }

    // ── #2151 PR C: single areaKey scope returns exactly the listings the port returns for it
    //    (legacy multi-key areaKeys[] request path no longer exists — see oq_c3 tests above) ─────

    @Test
    void findAgriMapListings_singleAreaKey_returnsPortSuppliedListings() {
        AgriDestinationPort.AgriParcel p1 = parcel("id-1", "Farm1", "IN|KA|Udupi|Area1", 13.3, 74.7, "Area1", null);
        AgriDestinationPort.AgriParcel p2 = parcel("id-2", "Farm2", "IN|KA|Udupi|Area1", 13.4, 74.8, "Area1", null);
        stubParcels(List.of(p1, p2), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), true, null);

        assertThat(resp.listings()).hasSize(2);
        assertThat(resp.listings().stream().map(AgriMapListingItem::id))
                .containsExactlyInAnyOrder("id-1", "id-2");
    }

    // ── #1454 anon: pricePaise null + lat/lng coarsened; zero-PII fields preserved ────────────

    @Test
    void findAgriMapListings_anonymous_masksPriceAndCoarsensCoords() {
        AgriDestinationPort.AgriParcel source = new AgriDestinationPort.AgriParcel(
                "anon-1", "2.5-Acre Farm, Shirva", "IN|KA|Udupi|Area1",
                13.34091, 74.74215, "agricultural_land", "Shirva", "{\"type\":\"Polygon\"}",
                new BigDecimal("2.5"), "acres", new BigDecimal("2.47"), 5000000L, "sale",
                null, null, null, null, null, null, null, null, null);
        stubParcels(List.of(source), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), false, null);

        AgriMapListingItem returned = resp.listings().get(0);
        assertThat(returned.pricePaise()).isNull();
        assertThat(returned.latitude()).isEqualTo(13.34);
        assertThat(returned.longitude()).isEqualTo(74.74);
        assertThat(returned.areaKey()).isEqualTo("IN|KA|Udupi|Area1");
        assertThat(returned.boundaryGeoJson()).isEqualTo("{\"type\":\"Polygon\"}");
    }

    @Test
    void findAgriMapListings_anonymous_nullCoords_stayNull() {
        AgriDestinationPort.AgriParcel source = new AgriDestinationPort.AgriParcel(
                "anon-null", null, "IN|KA|Udupi|Area1", null, null,
                "agricultural_land", "Hebri", null, null, null, null, 9000000L, null,
                null, null, null, null, null, null, null, null, null);
        stubParcels(List.of(source), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), false, null);

        AgriMapListingItem returned = resp.listings().get(0);
        assertThat(returned.latitude()).as("null coord must NOT become 0.0").isNull();
        assertThat(returned.longitude()).as("null coord must NOT become 0.0").isNull();
        assertThat(returned.pricePaise()).isNull();
    }

    // ── #1454 authed: exact lat/lng + pricePaise unchanged ────────────────────────────────────

    @Test
    void findAgriMapListings_authenticated_returnsExactCoordsAndPrice() {
        AgriDestinationPort.AgriParcel source = new AgriDestinationPort.AgriParcel(
                "auth-1", "5-Acre Farm, Brahmavar", "IN|KA|Udupi|Area1",
                13.34091, 74.74215, "agricultural_land", "Brahmavar", "{\"type\":\"Polygon\"}",
                new BigDecimal("5.0"), "acres", new BigDecimal("5.0"), 12500000L, "sale",
                null, null, null, null, null, null, null, null, null);
        stubParcels(List.of(source), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), true, null);

        AgriMapListingItem returned = resp.listings().get(0);
        assertThat(returned.latitude()).isEqualTo(13.34091);
        assertThat(returned.longitude()).isEqualTo(74.74215);
        assertThat(returned.pricePaise()).isEqualTo(12500000L);
    }

    // ── #1551 new canonical agri fields pass through for both anon and authed ─────────────────

    @Test
    void findAgriMapListings_anonymous_newFieldsPassThrough() {
        OffsetDateTime updatedAt = OffsetDateTime.of(2025, 6, 1, 10, 0, 0, 0, ZoneOffset.UTC);
        AgriDestinationPort.AgriParcel source = new AgriDestinationPort.AgriParcel(
                "anon-new-1", "Farm with agri metadata", "IN|KA|Udupi|Area1",
                13.34091, 74.74215, "agricultural_land", "Shirva",
                null, new BigDecimal("3.0"), "acres", new BigDecimal("3.0"),
                8000000L, "sale", "BOREWELL", "wetland", true, false,
                "PAVED", "RED_LATERITE", "CULTIVATED", "SINGLE_OWNER", updatedAt);
        stubParcels(List.of(source), false);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", "IN|KA|Udupi|Area1", Optional.empty(), false, null);

        AgriMapListingItem returned = resp.listings().get(0);
        assertThat(returned.roadAccess()).isEqualTo("PAVED");
        assertThat(returned.soilType()).isEqualTo("RED_LATERITE");
        assertThat(returned.cultivationStatus()).isEqualTo("CULTIVATED");
        assertThat(returned.ownershipType()).isEqualTo("SINGLE_OWNER");
        assertThat(returned.updatedAt()).isEqualTo(updatedAt);
        assertThat(returned.pricePaise()).isNull();
        assertThat(returned.latitude()).isEqualTo(13.34);
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────────────

    private static AgriDestinationPort.AgriParcel parcel(String id, String title, String areaKey,
                                                           Double lat, Double lon, String locality,
                                                           Long pricePaise) {
        return new AgriDestinationPort.AgriParcel(
                id, title, areaKey, lat, lon, "agricultural_land", locality, null,
                null, null, null, pricePaise, null, null, null, null, null,
                null, null, null, null, null);
    }

    private void stubParcels(List<AgriDestinationPort.AgriParcel> content, boolean hasMore) {
        when(agriDestinationPort.findParcels(any())).thenReturn(
                new AgriDestinationPort.ParcelPage(content, 0,
                        DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST, content.size(), hasMore));
    }
}
