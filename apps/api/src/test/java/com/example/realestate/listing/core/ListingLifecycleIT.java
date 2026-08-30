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

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for the full broker-facing listing lifecycle, verified at the JPA/DB layer.
 *
 * <p>Lifecycle under test:
 * <ol>
 *   <li>Create DRAFT</li>
 *   <li>Update title while in DRAFT</li>
 *   <li>Submit: DRAFT → PENDING_REVIEW</li>
 *   <li>Approve: PENDING_REVIEW → LIVE</li>
 *   <li>Archive: LIVE → ARCHIVED</li>
 *   <li>Reopen: ARCHIVED → DRAFT</li>
 *   <li>Resubmit: DRAFT → PENDING_REVIEW</li>
 * </ol>
 *
 * <p>Each step calls {@code saveAndFlush()} and then re-fetches via {@code findById()}
 * to assert that the persisted value matches the expected state.
 *
 * <p>Uses a real PostgreSQL container (Testcontainers) with all Flyway migrations applied.
 * Skipped automatically when Docker is unavailable ({@code disabledWithoutDocker = true}).
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        // Disable SSL — Testcontainers Postgres doesn't use SSL
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        // Allow Hibernate to send String values into Postgres enum columns
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // Include test stubs (auth schema) before real migrations
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration"
})
class ListingLifecycleIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine");

    @Autowired
    private ListingRepository listingRepository;

    @Test
    @DisplayName("Full lifecycle: DRAFT → PENDING_REVIEW → LIVE → ARCHIVED → DRAFT → PENDING_REVIEW")
    void fullListingLifecycle_statusTransitionsPersistedCorrectly() {
        OffsetDateTime now = OffsetDateTime.now();

        // ── Step 1: Create DRAFT ──────────────────────────────────────────────
        Listing listing = new Listing();
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setPropertyType("house");
        listing.setTitle("Lifecycle Test Property");
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);

        Listing saved = listingRepository.saveAndFlush(listing);
        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();

        assertThat(fromDb.getStatus())
                .as("Step 1: status should be DRAFT after initial save")
                .isEqualTo(ListingStatus.DRAFT.toDbValue());

        // ── Step 2: Update title while in DRAFT ───────────────────────────────
        fromDb.setTitle("Lifecycle Test Property — Updated");
        fromDb.setUpdatedAt(OffsetDateTime.now());
        listingRepository.saveAndFlush(fromDb);

        Listing afterTitleUpdate = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterTitleUpdate.getTitle())
                .as("Step 2: updated title should be persisted")
                .isEqualTo("Lifecycle Test Property — Updated");
        assertThat(afterTitleUpdate.getStatus())
                .as("Step 2: status should still be DRAFT after title update")
                .isEqualTo(ListingStatus.DRAFT.toDbValue());

        // ── Step 3: Submit — DRAFT → PENDING_REVIEW ───────────────────────────
        afterTitleUpdate.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        afterTitleUpdate.setUpdatedAt(OffsetDateTime.now());
        listingRepository.saveAndFlush(afterTitleUpdate);

        Listing afterSubmit = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterSubmit.getStatus())
                .as("Step 3: status should be PENDING_REVIEW after submit")
                .isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());

        // ── Step 4: Approve — PENDING_REVIEW → LIVE ───────────────────────────
        afterSubmit.setStatus(ListingStatus.LIVE.toDbValue());
        afterSubmit.setUpdatedAt(OffsetDateTime.now());
        listingRepository.saveAndFlush(afterSubmit);

        Listing afterApprove = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterApprove.getStatus())
                .as("Step 4: status should be LIVE after approval")
                .isEqualTo(ListingStatus.LIVE.toDbValue());

        // ── Step 5: Archive — LIVE → ARCHIVED ────────────────────────────────
        afterApprove.setStatus(ListingStatus.ARCHIVED.toDbValue());
        afterApprove.setUpdatedAt(OffsetDateTime.now());
        listingRepository.saveAndFlush(afterApprove);

        Listing afterArchive = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterArchive.getStatus())
                .as("Step 5: status should be ARCHIVED after archiving")
                .isEqualTo(ListingStatus.ARCHIVED.toDbValue());

        // ── Step 6: Reopen — ARCHIVED → DRAFT ────────────────────────────────
        afterArchive.setStatus(ListingStatus.DRAFT.toDbValue());
        afterArchive.setUpdatedAt(OffsetDateTime.now());
        listingRepository.saveAndFlush(afterArchive);

        Listing afterReopen = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterReopen.getStatus())
                .as("Step 6: status should be DRAFT after reopening from ARCHIVED")
                .isEqualTo(ListingStatus.DRAFT.toDbValue());

        // ── Step 7: Resubmit — DRAFT → PENDING_REVIEW ────────────────────────
        afterReopen.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        afterReopen.setUpdatedAt(OffsetDateTime.now());
        listingRepository.saveAndFlush(afterReopen);

        Listing afterResubmit = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterResubmit.getStatus())
                .as("Step 7: status should be PENDING_REVIEW after resubmit")
                .isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
    }
}
