package com.example.realestate.poi;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * #2642 (user-approved extension, V139): proves the fix for the pre-existing
 * {@code listing_pois_listing_osm_unique} bug against a real Postgres constraint —
 * WebMvcTest/unit tests mock the repository and cannot exercise this.
 *
 * <p>V25's original constraint was {@code UNIQUE NULLS NOT DISTINCT (listing_id, osm_id)},
 * which (contrary to its own comment "NULLs (manual rows) do not conflict") treats every
 * manual POI's NULL {@code osm_id} as equal, so a second manual POI on the same listing
 * always violated the constraint. V139 replaces it with a partial unique index scoped to
 * {@code osm_id IS NOT NULL}.
 *
 * <p>Mirrors {@code ListingQualityOwnershipIT} for setup: {@code @DataJpaTest +
 * @Testcontainers + @AutoConfigureTestDatabase(replace=NONE) + @TestPropertySource} with the
 * same connection properties and Flyway locations.
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword="
})
class ListingPoiUniqueConstraintIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private ListingPoiRepository listingPoiRepository;

    // -----------------------------------------------------------------------
    // (a) Two manual POIs (osm_id NULL) on the same listing must both persist.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("V139: two manual POIs (NULL osm_id) on the same listing both persist")
    void twoManualPois_sameListing_bothPersist() {
        Listing listing = listingRepository.saveAndFlush(newListing("Manual POI dedup test"));

        ListingPoi first = manualPoi(listing.getId(), "Sri Krishna Temple", "WORSHIP");
        ListingPoi second = manualPoi(listing.getId(), "Manipal Hospital", "HOSPITAL");

        listingPoiRepository.saveAndFlush(first);
        // Prior to V139 this second insert threw a duplicate-key DataIntegrityViolationException
        // on (listing_id, NULL) — reproducing the live bug report.
        listingPoiRepository.saveAndFlush(second);

        List<ListingPoi> stored = listingPoiRepository.findByListingId(listing.getId());
        assertThat(stored)
                .as("both manual POIs must be persisted for the listing")
                .hasSize(2)
                .extracting(ListingPoi::getName)
                .containsExactlyInAnyOrder("Sri Krishna Temple", "Manipal Hospital");
        assertThat(stored).allMatch(p -> p.getOsmId() == null);
    }

    // -----------------------------------------------------------------------
    // (b) Regression: two provider-derived POIs with the SAME osm_id for the
    // same listing are still rejected — the original dedup intent must hold.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("V139 regression: duplicate osm_id for the same listing is still rejected")
    void duplicateOsmId_sameListing_stillRejected() {
        Listing listing = listingRepository.saveAndFlush(newListing("Overpass dedup regression test"));

        ListingPoi first = overpassPoi(listing.getId(), "District Hospital", "osm-12345");
        listingPoiRepository.saveAndFlush(first);

        ListingPoi duplicate = overpassPoi(listing.getId(), "District Hospital (duplicate fetch)", "osm-12345");

        assertThatThrownBy(() -> listingPoiRepository.saveAndFlush(duplicate))
                .as("a second POI with the same (listing_id, osm_id) must still violate the unique index")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static Listing newListing(String title) {
        OffsetDateTime now = OffsetDateTime.now();
        Listing l = new Listing();
        l.setCreatedBy(java.util.UUID.randomUUID());
        l.setStatus(ListingStatus.LIVE.toDbValue());
        l.setPropertyType("house");
        l.setTitle(title);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        return l;
    }

    private static ListingPoi manualPoi(java.util.UUID listingId, String name, String category) {
        ListingPoi poi = new ListingPoi();
        poi.setListingId(listingId);
        poi.setName(name);
        poi.setCategory(category);
        poi.setSource("manual");
        poi.setOsmId(null);
        poi.setApproved(true);
        poi.setPinned(false);
        return poi;
    }

    private static ListingPoi overpassPoi(java.util.UUID listingId, String name, String osmId) {
        ListingPoi poi = new ListingPoi();
        poi.setListingId(listingId);
        poi.setName(name);
        poi.setCategory("HOSPITAL");
        poi.setSource("overpass");
        poi.setOsmId(osmId);
        poi.setDistanceMeters(150);
        poi.setApproved(false);
        poi.setPinned(false);
        return poi;
    }
}
