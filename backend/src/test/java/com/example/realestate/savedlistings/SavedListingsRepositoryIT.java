package com.example.realestate.savedlistings;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import org.junit.jupiter.api.DisplayName;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * #1566 saved-homes: real-Postgres repository/migration verification.
 *
 * <p>Harness copied from {@code AgriListingBoundaryJourneyIT} — {@code @DataJpaTest} with a
 * real {@code postgis/postgis:15-3.4} container (property_listings depends on PostGIS-backed
 * columns elsewhere in the schema) and Flyway running the full migration set through V107,
 * with the {@code concurrently_keyword} placeholder emptied so CONCURRENTLY index creation
 * (from earlier migrations) runs inside Flyway's transaction on a fresh container.
 *
 * <p>Covers: V107 migration applies cleanly; UNIQUE(user_id, listing_id) is enforced;
 * the FK to property_listings works (insert fails for an unknown listing, cascades on
 * delete); idempotent save/delete at the repository layer.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class SavedListingsRepositoryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private SavedListingRepository savedListingRepository;

    @Autowired
    private ListingRepository listingRepository;

    private UUID seedListing() {
        Listing listing = new Listing();
        listing.setPropertyType("house");
        listing.setTitle("Test listing for #1566");
        listing.setLocality("Manipal");
        Listing saved = listingRepository.saveAndFlush(listing);
        return saved.getId();
    }

    private SavedListing newSavedListing(UUID userId, UUID listingId) {
        SavedListing s = new SavedListing();
        s.setUserId(userId);
        s.setListingId(listingId);
        s.setCreatedAt(OffsetDateTime.now());
        return s;
    }

    @Test
    @DisplayName("V107 migration applied: saved_listings table accepts a row referencing a real listing")
    void migrationApplied_insertAndReadBack() {
        UUID userId = UUID.randomUUID();
        UUID listingId = seedListing();

        SavedListing saved = savedListingRepository.saveAndFlush(newSavedListing(userId, listingId));

        assertThat(saved.getId()).isNotNull();
        assertThat(savedListingRepository.findById(saved.getId())).isPresent();
        assertThat(savedListingRepository.findByUserIdOrderByCreatedAtDesc(userId))
                .extracting(SavedListing::getListingId)
                .containsExactly(listingId);
    }

    @Test
    @DisplayName("UNIQUE(user_id, listing_id) rejects a duplicate save for the same user+listing")
    void uniqueConstraint_rejectsDuplicateSave() {
        UUID userId = UUID.randomUUID();
        UUID listingId = seedListing();

        savedListingRepository.saveAndFlush(newSavedListing(userId, listingId));

        assertThatThrownBy(() ->
                savedListingRepository.saveAndFlush(newSavedListing(userId, listingId)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("two different users can each save the same listing (unique constraint is per-user)")
    void uniqueConstraint_scopedPerUser_allowsDifferentUsersSameListing() {
        UUID userA = UUID.randomUUID();
        UUID userB = UUID.randomUUID();
        UUID listingId = seedListing();

        savedListingRepository.saveAndFlush(newSavedListing(userA, listingId));
        savedListingRepository.saveAndFlush(newSavedListing(userB, listingId));

        assertThat(savedListingRepository.findByUserIdOrderByCreatedAtDesc(userA)).hasSize(1);
        assertThat(savedListingRepository.findByUserIdOrderByCreatedAtDesc(userB)).hasSize(1);
    }

    @Test
    @DisplayName("FK to property_listings rejects a save for a listing id that does not exist")
    void foreignKey_rejectsUnknownListingId() {
        UUID userId = UUID.randomUUID();
        UUID unknownListingId = UUID.randomUUID();

        assertThatThrownBy(() ->
                savedListingRepository.saveAndFlush(newSavedListing(userId, unknownListingId)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("ON DELETE CASCADE: deleting the underlying listing removes its saved_listings rows")
    void foreignKey_cascadesOnListingDelete() {
        UUID userId = UUID.randomUUID();
        UUID listingId = seedListing();
        savedListingRepository.saveAndFlush(newSavedListing(userId, listingId));

        listingRepository.deleteById(listingId);
        listingRepository.flush();

        assertThat(savedListingRepository.findByUserIdOrderByCreatedAtDesc(userId)).isEmpty();
    }

    @Test
    @DisplayName("idempotent delete: deleteByUserIdAndListingId on an absent row is a harmless no-op")
    void idempotentDelete_absentRowIsNoOp() {
        UUID userId = UUID.randomUUID();
        UUID listingId = seedListing();

        long deleted = savedListingRepository.deleteByUserIdAndListingId(userId, listingId);

        assertThat(deleted).isZero();
    }

    @Test
    @DisplayName("idempotent delete: removes exactly the caller's own row, scoped by (user_id, listing_id)")
    void idempotentDelete_removesOwnRowOnly() {
        UUID userA = UUID.randomUUID();
        UUID userB = UUID.randomUUID();
        UUID listingId = seedListing();

        savedListingRepository.saveAndFlush(newSavedListing(userA, listingId));
        savedListingRepository.saveAndFlush(newSavedListing(userB, listingId));

        long deleted = savedListingRepository.deleteByUserIdAndListingId(userA, listingId);

        assertThat(deleted).isEqualTo(1);
        assertThat(savedListingRepository.findByUserIdOrderByCreatedAtDesc(userA)).isEmpty();
        assertThat(savedListingRepository.findByUserIdOrderByCreatedAtDesc(userB)).hasSize(1);
    }

    @Test
    @DisplayName("existsByUserIdAndListingId + findListingIdsByUserId support idempotent save / hydration")
    void existsAndListIds_supportIdempotentSaveAndHydration() {
        UUID userId = UUID.randomUUID();
        UUID listingId = seedListing();

        assertThat(savedListingRepository.existsByUserIdAndListingId(userId, listingId)).isFalse();

        savedListingRepository.saveAndFlush(newSavedListing(userId, listingId));

        assertThat(savedListingRepository.existsByUserIdAndListingId(userId, listingId)).isTrue();
        List<UUID> ids = savedListingRepository.findListingIdsByUserId(userId);
        assertThat(ids).containsExactly(listingId);
    }
}
