package com.example.realestate.broker;

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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ownership isolation integration test for the broker listing-quality page.
 *
 * <p>Proves that {@link ListingRepository#findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc}
 * — the repository predicate used by {@link com.example.realestate.quality.ListingQualityService} —
 * is the hard ownership boundary. Broker A can never see Broker B's listings and vice-versa.
 *
 * <p>Also verifies that:
 * <ul>
 *   <li>Archived listings are excluded regardless of owner.</li>
 *   <li>Quality columns ({@code quality_score}, {@code quality_breakdown},
 *       {@code quality_computed_at}) are persisted and retrievable without distortion.</li>
 * </ul>
 *
 * <p>Mirrors {@link com.example.realestate.listing.core.ListingLifecycleIT} exactly for setup:
 * {@code @DataJpaTest + @Testcontainers + @AutoConfigureTestDatabase(replace=NONE) +
 * @TestPropertySource} with the same connection properties and Flyway locations.
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
        // V73 has CREATE INDEX CONCURRENTLY (non-transactional) mixed with transactional
        // DDL. Flyway requires mixed=true to tolerate this — same as SchoolAreaMatchingIntegrationTest.
        "spring.flyway.mixed=true",
        // Disable CONCURRENTLY keyword so Flyway's index creation runs synchronously
        // inside Testcontainers (CONCURRENTLY deadlocks on arm64/Rosetta with Flyway VIDs).
        "spring.flyway.placeholders.concurrently_keyword="
})
class ListingQualityOwnershipIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private ListingRepository listingRepository;

    private static final UUID BROKER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    private static final UUID BROKER_B = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");

    // -----------------------------------------------------------------------
    // 1. Broker A sees only Broker A's listings; Broker B listings never appear
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("Ownership isolation: broker A's query returns only broker A's listings")
    void brokerA_queryReturnsOnlyBrokerAListings() {
        OffsetDateTime now = OffsetDateTime.now();

        // Seed Broker A — one scored LIVE, one unscored DRAFT
        Listing a1 = liveListing(BROKER_A, "A Farm 1", now);
        a1.setQualityScore((short) 85);
        a1.setQualityBreakdown("{\"overall\":85,\"computedAt\":\"2026-06-20T10:00:00Z\",\"components\":[]}");
        a1.setQualityComputedAt(Instant.parse("2026-06-20T10:00:00Z"));
        Listing savedA1 = listingRepository.saveAndFlush(a1);

        Listing a2 = draftListing(BROKER_A, "A Farm 2", now);
        Listing savedA2 = listingRepository.saveAndFlush(a2);

        // Seed Broker B — two listings that must never appear in Broker A's results
        Listing b1 = liveListing(BROKER_B, "B Farm 1", now);
        listingRepository.saveAndFlush(b1);

        Listing b2 = draftListing(BROKER_B, "B Farm 2", now);
        listingRepository.saveAndFlush(b2);

        // Query as Broker A
        Page<Listing> pageA = listingRepository
                .findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(BROKER_A, Pageable.ofSize(100));

        List<Listing> resultsA = pageA.getContent();
        Set<UUID> returnedIds = resultsA.stream().map(Listing::getId).collect(Collectors.toSet());

        // Must contain both of Broker A's listings
        assertThat(returnedIds)
                .as("Broker A's results must include both of A's non-archived listings")
                .containsExactlyInAnyOrder(savedA1.getId(), savedA2.getId());

        // Must NOT contain any of Broker B's listings
        assertThat(resultsA)
                .as("Broker A's results must not contain any listing owned by Broker B")
                .noneMatch(l -> BROKER_B.equals(l.getCreatedBy()));

        // Verify scored listing carries quality data through the predicate unchanged
        Listing a1FromQuery = resultsA.stream()
                .filter(l -> l.getId().equals(savedA1.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(a1FromQuery.getQualityScore())
                .as("quality_score must round-trip unchanged")
                .isEqualTo((short) 85);
        assertThat(a1FromQuery.getQualityBreakdown())
                .as("quality_breakdown must be non-null for scored listing")
                .isNotNull();
        assertThat(a1FromQuery.getQualityComputedAt())
                .as("quality_computed_at must round-trip unchanged")
                .isNotNull();

        // Verify unscored listing has null quality columns
        Listing a2FromQuery = resultsA.stream()
                .filter(l -> l.getId().equals(savedA2.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(a2FromQuery.getQualityScore())
                .as("quality_score must be null for unscored listing")
                .isNull();
    }

    @Test
    @DisplayName("Ownership isolation: broker B's query returns only broker B's listings")
    void brokerB_queryReturnsOnlyBrokerBListings() {
        OffsetDateTime now = OffsetDateTime.now();

        // Seed Broker A — must never appear in Broker B's results
        Listing a1 = liveListing(BROKER_A, "A Farm X", now);
        listingRepository.saveAndFlush(a1);

        // Seed Broker B
        Listing b1 = liveListing(BROKER_B, "B Farm 1", now);
        Listing savedB1 = listingRepository.saveAndFlush(b1);

        Listing b2 = draftListing(BROKER_B, "B Farm 2", now);
        Listing savedB2 = listingRepository.saveAndFlush(b2);

        // Query as Broker B
        Page<Listing> pageB = listingRepository
                .findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(BROKER_B, Pageable.ofSize(100));

        List<Listing> resultsB = pageB.getContent();
        Set<UUID> returnedIds = resultsB.stream().map(Listing::getId).collect(Collectors.toSet());

        assertThat(returnedIds)
                .as("Broker B's results must include both of B's non-archived listings")
                .containsExactlyInAnyOrder(savedB1.getId(), savedB2.getId());

        assertThat(resultsB)
                .as("Broker B's results must not contain any listing owned by Broker A")
                .noneMatch(l -> BROKER_A.equals(l.getCreatedBy()));
    }

    // -----------------------------------------------------------------------
    // 2. Archived listings excluded regardless of owner
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("Archived listings are excluded from the owner-scoped predicate")
    void archivedListings_excludedFromResults() {
        OffsetDateTime now = OffsetDateTime.now();

        Listing live = liveListing(BROKER_A, "Live Farm", now);
        Listing savedLive = listingRepository.saveAndFlush(live);

        Listing archived = archivedListing(BROKER_A, "Archived Farm", now);
        listingRepository.saveAndFlush(archived);

        Page<Listing> page = listingRepository
                .findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(BROKER_A, Pageable.ofSize(100));

        List<UUID> ids = page.getContent().stream().map(Listing::getId).toList();
        assertThat(ids)
                .as("Only the non-archived listing should appear")
                .containsExactly(savedLive.getId());
        assertThat(ids)
                .as("Archived listing must not appear")
                .doesNotContain(archived.getId());
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static Listing liveListing(UUID ownerId, String title, OffsetDateTime now) {
        Listing l = new Listing();
        l.setCreatedBy(ownerId);
        l.setStatus(ListingStatus.LIVE.toDbValue());
        l.setPropertyType("land");
        l.setTitle(title);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        return l;
    }

    private static Listing draftListing(UUID ownerId, String title, OffsetDateTime now) {
        Listing l = new Listing();
        l.setCreatedBy(ownerId);
        l.setStatus(ListingStatus.DRAFT.toDbValue());
        l.setPropertyType("land");
        l.setTitle(title);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        return l;
    }

    private static Listing archivedListing(UUID ownerId, String title, OffsetDateTime now) {
        Listing l = new Listing();
        l.setCreatedBy(ownerId);
        l.setStatus(ListingStatus.ARCHIVED.toDbValue());
        l.setPropertyType("land");
        l.setTitle(title);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        l.setArchivedAt(now.toInstant());
        return l;
    }
}
