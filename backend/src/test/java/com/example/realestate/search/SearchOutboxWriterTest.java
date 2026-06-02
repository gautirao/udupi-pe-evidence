package com.example.realestate.search;

import com.example.realestate.search.outbox.ListingSearchOutboxEntry;
import com.example.realestate.search.outbox.ListingSearchOutboxRepository;
import com.example.realestate.search.outbox.SearchOutboxEventType;
import com.example.realestate.search.outbox.SearchOutboxOperation;
import com.example.realestate.search.outbox.SearchOutboxWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class SearchOutboxWriterTest {

    @Mock
    private ListingSearchOutboxRepository repository;

    private SearchOutboxWriter writer;

    @BeforeEach
    void setUp() {
        writer = new SearchOutboxWriter(repository, new ObjectMapper());
    }

    @Test
    void writeEvent_createsOutboxRow_withIndexOperation() {
        UUID listingId = UUID.randomUUID();
        writer.writeEvent(listingId, SearchOutboxEventType.LISTING_CREATED,
                SearchOutboxOperation.INDEX, "DRAFT", Instant.now());

        ArgumentCaptor<ListingSearchOutboxEntry> captor =
                ArgumentCaptor.forClass(ListingSearchOutboxEntry.class);
        verify(repository).save(captor.capture());
        ListingSearchOutboxEntry saved = captor.getValue();

        assertThat(saved.getListingId()).isEqualTo(listingId.toString());
        assertThat(saved.getEventType()).isEqualTo("LISTING_CREATED");
        assertThat(saved.getOperation()).isEqualTo("INDEX");
    }

    @Test
    void writeEvent_createsOutboxRow_withDeleteOperation() {
        UUID listingId = UUID.randomUUID();
        writer.writeEvent(listingId, SearchOutboxEventType.LISTING_DELETED,
                SearchOutboxOperation.DELETE, "ARCHIVED", Instant.now());

        ArgumentCaptor<ListingSearchOutboxEntry> captor =
                ArgumentCaptor.forClass(ListingSearchOutboxEntry.class);
        verify(repository).save(captor.capture());
        ListingSearchOutboxEntry saved = captor.getValue();

        assertThat(saved.getOperation()).isEqualTo("DELETE");
        assertThat(saved.getEventType()).isEqualTo("LISTING_DELETED");
    }

    @Test
    void writeEvent_setsNonNullEventId() {
        UUID listingId = UUID.randomUUID();
        writer.writeEvent(listingId, SearchOutboxEventType.LISTING_UPDATED,
                SearchOutboxOperation.INDEX, "DRAFT", Instant.now());

        ArgumentCaptor<ListingSearchOutboxEntry> captor =
                ArgumentCaptor.forClass(ListingSearchOutboxEntry.class);
        verify(repository).save(captor.capture());

        assertThat(captor.getValue().getEventId()).isNotNull();
    }

    @Test
    void writeEvent_setsNullPublishedAt() {
        UUID listingId = UUID.randomUUID();
        writer.writeEvent(listingId, SearchOutboxEventType.LISTING_APPROVED,
                SearchOutboxOperation.INDEX, "LIVE", Instant.now());

        ArgumentCaptor<ListingSearchOutboxEntry> captor =
                ArgumentCaptor.forClass(ListingSearchOutboxEntry.class);
        verify(repository).save(captor.capture());

        assertThat(captor.getValue().getPublishedAt()).isNull();
    }

    @Test
    void writeEvent_payloadContainsNoPrivateData() {
        UUID listingId = UUID.randomUUID();
        writer.writeEvent(listingId, SearchOutboxEventType.LISTING_APPROVED,
                SearchOutboxOperation.INDEX, "LIVE", Instant.now());

        ArgumentCaptor<ListingSearchOutboxEntry> captor =
                ArgumentCaptor.forClass(ListingSearchOutboxEntry.class);
        verify(repository).save(captor.capture());
        String payload = captor.getValue().getPayload();

        assertThat(payload).doesNotContain("contactInfo");
        assertThat(payload).doesNotContain("contactPhone");
        assertThat(payload).doesNotContain("createdBy");
        assertThat(payload).doesNotContain("trustTier");
        assertThat(payload).doesNotContain("rankingScore");
        assertThat(payload).doesNotContain("lastApprovedSnapshot");
        // Payload should contain only the allowed keys
        assertThat(payload).contains("listing_id");
        assertThat(payload).contains("event_type");
        assertThat(payload).contains("operation");
        assertThat(payload).contains("status");
    }
}
