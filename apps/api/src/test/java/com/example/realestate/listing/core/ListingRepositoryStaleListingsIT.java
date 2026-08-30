package com.example.realestate.listing.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link ListingRepository#findLiveListingsNotConfirmedSince}, the
 * admin stale-listing visibility query (#1794 Phase 1).
 *
 * <p>Verifies the query's core NULL-as-stale and strict-boundary semantics against a real
 * PostgreSQL instance (Testcontainers), since these are native-SQL predicates that a Mockito
 * unit test cannot exercise.
 *
 * <p>Uses a real PostgreSQL container with all Flyway migrations applied (incl. V114, which
 * adds {@code last_confirmed_at}). Skipped automatically when Docker is unavailable
 * ({@code disabledWithoutDocker = true}).
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
class ListingRepositoryStaleListingsIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private ListingRepository listingRepository;

    @Test
    @DisplayName("NULL last_confirmed_at counts as stale; boundary is strictly < threshold; non-LIVE excluded")
    void findLiveListingsNotConfirmedSince_appliesNullAsStaleAndStrictBoundary() {
        // Truncate to micros — Postgres timestamptz precision — so equality/boundary comparisons
        // are exact rather than flaky on sub-microsecond jitter.
        OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
        OffsetDateTime threshold = now.minusDays(14);

        // 1. LIVE, never confirmed (NULL) — MUST be returned (NULL counts as stale)
        Listing neverConfirmed = saveListing(ListingStatus.LIVE.toDbValue(), null, now);

        // 2. LIVE, confirmed 20 days ago (older than threshold) — MUST be returned
        Listing longStale = saveListing(ListingStatus.LIVE.toDbValue(), now.minusDays(20), now);

        // 3. LIVE, confirmed 1 hour ago (well within 14 days) — must NOT be returned
        Listing recentlyConfirmed = saveListing(ListingStatus.LIVE.toDbValue(), now.minusHours(1), now);

        // 4. LIVE, confirmed EXACTLY at the threshold — must NOT be returned (boundary is strict <)
        Listing atBoundary = saveListing(ListingStatus.LIVE.toDbValue(), threshold, now);

        // 5. Non-LIVE (DRAFT), never confirmed — must NOT be returned regardless of confirmation state
        Listing nonLiveNeverConfirmed = saveListing(ListingStatus.DRAFT.toDbValue(), null, now);

        Page<Listing> result = listingRepository.findLiveListingsNotConfirmedSince(
                threshold, PageRequest.of(0, 50));

        List<UUID> resultIds = result.getContent().stream().map(Listing::getId).toList();

        assertThat(resultIds)
                .as("NULL and long-stale LIVE listings are returned")
                .contains(neverConfirmed.getId(), longStale.getId());
        assertThat(resultIds)
                .as("recently-confirmed, at-boundary, and non-LIVE listings are excluded")
                .doesNotContain(recentlyConfirmed.getId(), atBoundary.getId(), nonLiveNeverConfirmed.getId());

        // NULLS FIRST ordering: the never-confirmed listing sorts ahead of the 20-day-stale one
        int neverConfirmedIndex = resultIds.indexOf(neverConfirmed.getId());
        int longStaleIndex = resultIds.indexOf(longStale.getId());
        assertThat(neverConfirmedIndex)
                .as("NULL last_confirmed_at sorts first (NULLS FIRST)")
                .isLessThan(longStaleIndex);
    }

    @Test
    @DisplayName("An unsorted Pageable (the production path — AdminListingController strips any "
            + "caller Sort before calling the repository) preserves the native query's own "
            + "ORDER BY last_confirmed_at ASC NULLS FIRST")
    void findLiveListingsNotConfirmedSince_withUnsortedPageable_preservesNativeOrdering() {
        OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
        OffsetDateTime threshold = now.minusDays(14);

        Listing neverConfirmed = saveListing(ListingStatus.LIVE.toDbValue(), null, now);
        Listing longStale = saveListing(ListingStatus.LIVE.toDbValue(), now.minusDays(20), now);

        // AdminListingController#stale always rebuilds an unsorted PageRequest (page + size only)
        // before calling the repository, regardless of any caller-supplied ?sort= param, so the
        // native @Query's own ORDER BY is the only ordering that governs in production. This test
        // exercises that exact path rather than a populated Sort, which the repository never
        // actually receives.
        PageRequest unsortedPageable = PageRequest.of(0, 20);

        Page<Listing> result = listingRepository.findLiveListingsNotConfirmedSince(
                threshold, unsortedPageable);

        List<UUID> resultIds = result.getContent().stream().map(Listing::getId).toList();

        assertThat(resultIds)
                .as("query executes without error and returns the expected stale listings")
                .contains(neverConfirmed.getId(), longStale.getId());

        int neverConfirmedIndex = resultIds.indexOf(neverConfirmed.getId());
        int longStaleIndex = resultIds.indexOf(longStale.getId());
        assertThat(neverConfirmedIndex)
                .as("native ORDER BY (NULLS FIRST, oldest-confirmed-first) governs ordering")
                .isLessThan(longStaleIndex);
    }

    private Listing saveListing(String status, OffsetDateTime lastConfirmedAt, OffsetDateTime now) {
        Listing listing = new Listing();
        listing.setStatus(status);
        listing.setPropertyType("house");
        listing.setTitle("Stale-query test listing");
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        listing.setLastConfirmedAt(lastConfirmedAt);
        return listingRepository.saveAndFlush(listing);
    }
}
