package com.example.realestate.listing.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link ListingRepository#existsActiveByDedupeHash},
 * {@link ListingRepository#countActiveByDedupeHash}, and
 * {@link ListingRepository#countActiveByDedupeHashAndIdNot} — the #2519 Active-scoped dedupe
 * lookups (archivedAt IS NULL AND status &lt;&gt; 'REJECTED').
 *
 * <p>Verifies the query's core exclusion semantics against a real PostgreSQL instance
 * (Testcontainers), since this is a JPQL predicate over archivedAt/status that a Mockito unit
 * test (see {@code ListingDeduplicationServiceTest}) can only prove is CALLED, not that it
 * ACTUALLY excludes the right rows.
 *
 * <p>Uses a real PostgreSQL container with all Flyway migrations applied. Skipped automatically
 * when Docker is unavailable ({@code disabledWithoutDocker = true}).
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
class ListingRepositoryDedupeActiveScopeIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private ListingRepository listingRepository;

    @Test
    @DisplayName("#2519 AC2: an ARCHIVED row sharing a dedupe hash does NOT count as an active match")
    void existsAndCountActiveByDedupeHash_archivedRow_excluded() {
        String hash = "archived-repost-hash";
        Listing archived = saveListing(ListingStatus.ARCHIVED.toDbValue(), hash, Instant.now());

        boolean exists = listingRepository.existsActiveByDedupeHash(hash);
        long count = listingRepository.countActiveByDedupeHash(hash);

        assertThat(exists).as("ARCHIVED row must not be treated as an active dedupe match").isFalse();
        assertThat(count).as("ARCHIVED row must not be counted").isZero();
        // Sanity: the row really was persisted with this hash and status — a false negative here
        // (e.g. save silently failing) would make the exists=false/count=0 assertions vacuous.
        assertThat(archived.getId()).isNotNull();
        assertThat(archived.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
    }

    @Test
    @DisplayName("#2519 AC2: a REJECTED row sharing a dedupe hash does NOT count as an active match")
    void existsAndCountActiveByDedupeHash_rejectedRow_excluded() {
        String hash = "rejected-resubmit-hash";
        Listing rejected = saveListing(ListingStatus.REJECTED.toDbValue(), hash, null);

        boolean exists = listingRepository.existsActiveByDedupeHash(hash);
        long count = listingRepository.countActiveByDedupeHash(hash);

        assertThat(exists).as("REJECTED row must not be treated as an active dedupe match").isFalse();
        assertThat(count).as("REJECTED row must not be counted").isZero();
        assertThat(rejected.getStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());
        assertThat(rejected.getArchivedAt()).as("REJECTED alone, without archiving, leaves archivedAt null").isNull();
    }

    @Test
    @DisplayName("#2519 AC4 control: a LIVE row sharing a dedupe hash STILL counts as an active match "
            + "— protection is preserved, not just relaxed")
    void existsAndCountActiveByDedupeHash_liveRow_stillBlocks() {
        String hash = "live-duplicate-hash";
        Listing live = saveListing(ListingStatus.LIVE.toDbValue(), hash, null);

        boolean exists = listingRepository.existsActiveByDedupeHash(hash);
        long count = listingRepository.countActiveByDedupeHash(hash);

        assertThat(exists).as("a genuine LIVE duplicate must still be detected").isTrue();
        assertThat(count).isEqualTo(1L);
        assertThat(live.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
    }

    @Test
    @DisplayName("#2519 AC4 control: PENDING_REVIEW also counts as active (only ARCHIVED/REJECTED are excluded)")
    void existsAndCountActiveByDedupeHash_pendingReviewRow_stillBlocks() {
        String hash = "pending-review-duplicate-hash";
        saveListing(ListingStatus.PENDING_REVIEW.toDbValue(), hash, null);

        assertThat(listingRepository.existsActiveByDedupeHash(hash)).isTrue();
        assertThat(listingRepository.countActiveByDedupeHash(hash)).isEqualTo(1L);
    }

    @Test
    @DisplayName("#2519 AC2: a mix of one ARCHIVED + one LIVE row on the same hash counts only the LIVE one")
    void countActiveByDedupeHash_mixedArchivedAndLive_countsOnlyActive() {
        String hash = "mixed-repost-hash";
        saveListing(ListingStatus.ARCHIVED.toDbValue(), hash, Instant.now());
        Listing live = saveListing(ListingStatus.LIVE.toDbValue(), hash, null);

        long count = listingRepository.countActiveByDedupeHash(hash);

        assertThat(count).as("only the LIVE row is active; the archived sibling must not inflate the count")
                .isEqualTo(1L);
        assertThat(live.getId()).isNotNull();
    }

    @Test
    @DisplayName("#2519 AC2: countActiveByDedupeHashAndIdNot excludes an ARCHIVED sibling and self")
    void countActiveByDedupeHashAndIdNot_excludesArchivedSiblingAndSelf() {
        String hash = "update-exclude-self-hash";
        Listing self = saveListing(ListingStatus.LIVE.toDbValue(), hash, null);
        Listing archivedSibling = saveListing(ListingStatus.ARCHIVED.toDbValue(), hash, Instant.now());

        long countExcludingSelf = listingRepository.countActiveByDedupeHashAndIdNot(hash, self.getId());

        assertThat(countExcludingSelf)
                .as("self is excluded by id, and the archived sibling is excluded by status — net zero")
                .isZero();
        assertThat(archivedSibling.getId()).isNotEqualTo(self.getId());
    }

    @Test
    @DisplayName("#2519 AC4 control: countActiveByDedupeHashAndIdNot still finds a genuine LIVE duplicate")
    void countActiveByDedupeHashAndIdNot_liveOtherMatch_stillCounted() {
        String hash = "update-genuine-duplicate-hash";
        Listing original = saveListing(ListingStatus.LIVE.toDbValue(), hash, null);
        Listing beingUpdated = saveListing(ListingStatus.LIVE.toDbValue(), hash, null);

        long countExcludingSelf = listingRepository.countActiveByDedupeHashAndIdNot(hash, beingUpdated.getId());

        assertThat(countExcludingSelf).as("the other LIVE row with the same hash must still be found").isEqualTo(1L);
        assertThat(original.getId()).isNotEqualTo(beingUpdated.getId());
    }

    private Listing saveListing(String status, String dedupeHash, Instant archivedAt) {
        Listing listing = new Listing();
        listing.setStatus(status);
        listing.setPropertyType("house");
        listing.setTitle("Dedupe-active-scope test listing");
        listing.setDedupeHash(dedupeHash);
        listing.setArchivedAt(archivedAt);
        OffsetDateTime now = OffsetDateTime.now();
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        return listingRepository.saveAndFlush(listing);
    }
}
