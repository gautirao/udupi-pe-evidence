package com.example.realestate.search;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.search.indexer.ListingIndexDocument;
import com.example.realestate.search.indexer.OpenSearchIndexingAdapter;
import com.example.realestate.search.indexer.SearchIndexerProperties;
import com.example.realestate.search.indexer.SearchOutboxMetrics;
import com.example.realestate.search.indexer.SearchOutboxPoller;
import com.example.realestate.search.outbox.ListingSearchOutboxEntry;
import com.example.realestate.search.outbox.ListingSearchOutboxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SearchOutboxPollerTest {

    @Mock
    private ListingSearchOutboxRepository repository;
    @Mock
    private OpenSearchIndexingAdapter indexingAdapter;
    @Mock
    private ListingRepository listingRepository;
    @Mock
    private SearchOutboxMetrics metrics;

    private SearchIndexerProperties props;
    private SearchOutboxPoller poller;

    @BeforeEach
    void setUp() {
        props = new SearchIndexerProperties();
        props.getOutbox().setBatchSize(10);
        props.getOutbox().setMinEventAgeSeconds(0);
        poller = new SearchOutboxPoller(repository, indexingAdapter, props, listingRepository, metrics);
    }

    private ListingSearchOutboxEntry makeEntry(String operation, String status) {
        ListingSearchOutboxEntry entry = new ListingSearchOutboxEntry();
        entry.setEventId(UUID.randomUUID());
        entry.setListingId(UUID.randomUUID().toString());
        entry.setOperation(operation);
        entry.setStatus(status);
        entry.setOccurredAt(Instant.now().minusSeconds(60));
        return entry;
    }

    private Listing buildListing(UUID id, String title, String locality) {
        Listing listing = new Listing();
        listing.setId(id);
        listing.setTitle(title);
        listing.setLocality(locality);
        listing.setStatus("LIVE");
        listing.setPropertyType("house");
        listing.setSellerType("dealer");
        listing.setCreatedAt(OffsetDateTime.now());
        return listing;
    }

    @Test
    void pollAndPublish_indexesLiveListing() {
        ListingSearchOutboxEntry entry = makeEntry("INDEX", "LIVE");
        UUID listingUuid = UUID.fromString(entry.getListingId());
        Listing listing = buildListing(listingUuid, "Nice House", "Udupi Central");
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of(entry));
        when(listingRepository.findById(listingUuid)).thenReturn(Optional.of(listing));

        poller.pollAndPublish();

        ArgumentCaptor<ListingIndexDocument> docCaptor = ArgumentCaptor.forClass(ListingIndexDocument.class);
        verify(indexingAdapter).indexListing(eq(entry.getListingId()), docCaptor.capture());
        verify(indexingAdapter, never()).deleteListing(any());
        assertThat(entry.getPublishedAt()).isNotNull();
        ListingIndexDocument captured = docCaptor.getValue();
        assertThat(captured.getTitle()).isEqualTo("Nice House");
        assertThat(captured.getLocality()).isEqualTo("Udupi Central");
    }

    @Test
    void pollAndPublish_indexesLiveListing_listingNotFound_deletesFromIndex() {
        ListingSearchOutboxEntry entry = makeEntry("INDEX", "LIVE");
        UUID listingUuid = UUID.fromString(entry.getListingId());
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of(entry));
        when(listingRepository.findById(listingUuid)).thenReturn(Optional.empty());

        poller.pollAndPublish();

        verify(indexingAdapter).deleteListing(entry.getListingId());
        verify(indexingAdapter, never()).indexListing(any(), any());
        assertThat(entry.getPublishedAt()).isNotNull();
    }

    @Test
    void pollAndPublish_deletesOnDeleteOperation() {
        ListingSearchOutboxEntry entry = makeEntry("DELETE", "ARCHIVED");
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of(entry));

        poller.pollAndPublish();

        verify(indexingAdapter).deleteListing(entry.getListingId());
        verify(indexingAdapter, never()).indexListing(any(), any());
        assertThat(entry.getPublishedAt()).isNotNull();
    }

    @Test
    void pollAndPublish_deletesNonLiveListing() {
        ListingSearchOutboxEntry entry = makeEntry("INDEX", "DRAFT");
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of(entry));

        poller.pollAndPublish();

        // INDEX + non-LIVE → should delete (not index)
        verify(indexingAdapter).deleteListing(entry.getListingId());
        verify(indexingAdapter, never()).indexListing(any(), any());
        assertThat(entry.getPublishedAt()).isNotNull();
    }

    @Test
    void pollAndPublish_rearmsEntryOnFirstFailure() {
        // With maxRetryAttempts=3 (default), a single failure should re-arm (not go DEAD).
        ListingSearchOutboxEntry entry = makeEntry("DELETE", "ARCHIVED");
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of(entry));
        doThrow(new RuntimeException("Connection refused")).when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        // First failure: retryCount=1 < maxRetryAttempts=3 → re-armed, not DEAD.
        assertThat(entry.getRetryCount()).isEqualTo(1);
        assertThat(entry.getNextAttemptAt()).isNotNull();
        assertThat(entry.getStatus()).isNotEqualTo("DEAD");
        assertThat(entry.getErrorMessage()).contains("Connection refused");
        assertThat(entry.getFailedAt()).isNotNull();
        assertThat(entry.getPublishedAt()).isNull();
        verify(repository).save(entry);
        verify(metrics).recordRetry();
    }

    @Test
    void pollAndPublish_continuesBatchAfterFailure() {
        ListingSearchOutboxEntry failEntry = makeEntry("DELETE", "ARCHIVED");
        ListingSearchOutboxEntry okEntry = makeEntry("DELETE", "ARCHIVED");
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(failEntry, okEntry));
        doThrow(new RuntimeException("error"))
                .when(indexingAdapter).deleteListing(eq(failEntry.getListingId()));

        poller.pollAndPublish();

        // failEntry: retryCount incremented, re-armed (not DEAD, not published).
        assertThat(failEntry.getRetryCount()).isEqualTo(1);
        assertThat(failEntry.getPublishedAt()).isNull();
        // okEntry: processed successfully.
        assertThat(okEntry.getPublishedAt()).isNotNull();
        verify(repository, times(2)).save(any(ListingSearchOutboxEntry.class));
    }

    @Test
    void pollAndPublish_respectsMinEventAge() {
        props.getOutbox().setMinEventAgeSeconds(60);
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of());

        poller.pollAndPublish();

        // Verify the maxOccurredAt passed is approximately now - 60s
        ArgumentCaptor<Instant> instantCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(repository).findUnpublishedBatch(instantCaptor.capture(), any(Instant.class), any());
        Instant captured = instantCaptor.getValue();
        Instant expectedBefore = Instant.now().minusSeconds(55);
        Instant expectedAfter = Instant.now().minusSeconds(65);
        assertThat(captured).isBefore(expectedBefore);
        assertThat(captured).isAfter(expectedAfter);

        verify(indexingAdapter, never()).indexListing(any(), any());
        verify(indexingAdapter, never()).deleteListing(any());
    }

    @Test
    void pollAndPublish_respectsBatchSize() {
        props.getOutbox().setBatchSize(5);
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of());

        poller.pollAndPublish();

        // Verify PageRequest with batchSize=5 is passed
        verify(repository).findUnpublishedBatch(any(Instant.class), any(Instant.class), eq(PageRequest.of(0, 5)));
    }

    @Test
    void pollAndPublish_doesNotRepollDeadEntries() {
        // DEAD entries are excluded by the repository query — the mock returns empty
        // to simulate the WHERE (status IS NULL OR status <> 'DEAD') filter in effect.
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any())).thenReturn(List.of());

        poller.pollAndPublish();

        // No adapter calls — nothing to process
        verify(indexingAdapter, never()).indexListing(any(), any());
        verify(indexingAdapter, never()).deleteListing(any());
        // Repository save not called when batch is empty
        verify(repository, never()).save(any());
    }
}
