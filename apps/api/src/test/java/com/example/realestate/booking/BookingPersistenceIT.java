package com.example.realestate.booking;

import com.example.realestate.common.api.PagedResponse;
import com.example.realestate.exception.RateLimiterService;
import com.example.realestate.security.CallerInfo;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * #2844 (umbrella #2750) — DB-level replacement for legacy e2e/journey/booking-journey.spec.ts
 * UB1-UB3. {@link BookingServiceTest} proves the DataIntegrityViolation -> BookingConflictException
 * translation with a MOCKED repository; that proves nothing about the database. This class runs the
 * real {@link BookingService} against a real Postgres (Testcontainers, real Flyway chain) and proves:
 *
 * <ol>
 *   <li>The V45 partial unique index {@code idx_one_active_booking_per_user_listing ON
 *       viewing_requests (listing_id, requester_id) WHERE status IN ('REQUESTED', 'CONFIRMED',
 *       'NEEDS_RESOLUTION')} rejects a second active booking for the same (listing, requester),
 *       surfacing {@link BookingService.BookingConflictException}; it does NOT reject a different
 *       requester, nor a re-booking after the first one left the active set (partial predicate).</li>
 *   <li>{@code requesterMessage} survives the JPA write — read back with raw SQL from the table.</li>
 *   <li>The broker read path ({@link BookingController#dealer}, i.e. GET /api/bookings/broker, over
 *       the real service + repository) returns the saved message.</li>
 * </ol>
 *
 * <p><b>Harness</b>: same {@code @DataJpaTest + Testcontainers postgis/postgis:15-3.4 + real Flyway}
 * shape as {@link com.example.realestate.listing.crud.ReviewAction500ReproIT}. Deliberately NOT
 * {@code @Tag("integration")}: surefire's {@code <excludedGroups>integration</excludedGroups>} would
 * make it run nowhere in a default {@code mvn test}. Deliberately NOT {@code disabledWithoutDocker}:
 * no Docker must fail loudly, never skip green.
 *
 * <p><b>Transactions</b>: the default {@code @DataJpaTest} per-test transaction is switched off
 * ({@code NOT_SUPPORTED}) so every {@code createBooking} call commits in its own real transaction,
 * the duplicate check hits committed rows (exactly as in production), and the read-backs below
 * cannot be served from a shared persistence context. Rows are cleaned up explicitly.
 */
@DataJpaTest
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
@Import(BookingService.class)
class BookingPersistenceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final UUID BROKER = UUID.fromString("b0000000-2844-0000-0000-000000000001");
    private static final UUID REQUESTER = UUID.fromString("c0000000-2844-0000-0000-000000000002");
    private static final UUID OTHER_REQUESTER = UUID.fromString("c0000000-2844-0000-0000-000000000003");
    private static final String SLOT = "10:00-11:00";
    private static final String MESSAGE = "#2844 Please call before visiting - gate code 4321, ask for Ravi.";

    @Autowired private BookingService bookingService;
    @Autowired private JdbcTemplate jdbcTemplate;

    private BookingController controller;
    private UUID listingId;

    @BeforeEach
    void seed() {
        cleanup();
        jdbcTemplate.update("INSERT INTO auth.users (id) VALUES (?) ON CONFLICT DO NOTHING", REQUESTER);
        jdbcTemplate.update("INSERT INTO auth.users (id) VALUES (?) ON CONFLICT DO NOTHING", OTHER_REQUESTER);
        listingId = insertLiveListing(BROKER);
        // Real service + real repository; the rate limiter is only consulted by POST create.
        controller = new BookingController(bookingService, mock(RateLimiterService.class));
    }

    @AfterEach
    void cleanup() {
        jdbcTemplate.update("DELETE FROM viewing_requests WHERE broker_id = ?", BROKER);
        jdbcTemplate.update("DELETE FROM property_listings WHERE created_by = ?", BROKER);
    }

    // ---------------------------------------------------------------------------------------
    // (1) V45 partial unique index
    // ---------------------------------------------------------------------------------------

    @Test
    @DisplayName("(1) V45 index: second REQUESTED booking for the same (listing, requester) -> BookingConflictException, one row persisted")
    void secondActiveBooking_sameListingAndRequester_isRejectedByTheDatabase() {
        ViewingRequest first = bookingService.createBooking(REQUESTER, listingId, tomorrow(), SLOT, MESSAGE);
        assertThat(first.getId()).isNotNull();

        assertThatThrownBy(() -> bookingService.createBooking(
                REQUESTER, listingId, tomorrow().plusDays(1), "14:00-15:00", "second attempt"))
                .as("V45 idx_one_active_booking_per_user_listing must reject the duplicate active booking")
                .isInstanceOf(BookingService.BookingConflictException.class)
                .hasMessage("You already have an active booking for this listing");

        assertThat(countRows(listingId, REQUESTER))
                .as("exactly the first booking is committed; the duplicate was rolled back")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("(1) V45 index predicate includes NEEDS_RESOLUTION: a frozen booking still blocks a new one")
    void needsResolutionBooking_stillCountsAsActive() {
        ViewingRequest first = bookingService.createBooking(REQUESTER, listingId, tomorrow(), SLOT, MESSAGE);
        jdbcTemplate.update("UPDATE viewing_requests SET status = 'NEEDS_RESOLUTION' WHERE id = ?", first.getId());

        assertThatThrownBy(() -> bookingService.createBooking(
                REQUESTER, listingId, tomorrow().plusDays(1), "14:00-15:00", null))
                .as("V45 widened the V15 predicate with NEEDS_RESOLUTION; a frozen booking must still block")
                .isInstanceOf(BookingService.BookingConflictException.class);
        assertThat(countRows(listingId, REQUESTER)).isEqualTo(1);
    }

    @Test
    @DisplayName("(1) V45 index controls: different requester allowed; re-booking allowed once the first leaves the active set")
    void indexIsScopedToListingRequesterAndActiveStatuses() {
        ViewingRequest first = bookingService.createBooking(REQUESTER, listingId, tomorrow(), SLOT, MESSAGE);

        // Different requester, same listing: the index key is (listing_id, requester_id).
        ViewingRequest other = bookingService.createBooking(OTHER_REQUESTER, listingId, tomorrow(), SLOT, null);
        assertThat(other.getId()).isNotEqualTo(first.getId());

        // Partial predicate: once the first booking is CANCELLED it is outside the index.
        bookingService.cancelBooking(first.getId(), REQUESTER);
        ViewingRequest rebooked = bookingService.createBooking(
                REQUESTER, listingId, tomorrow().plusDays(2), SLOT, "rebook");
        assertThat(rebooked.getId()).isNotEqualTo(first.getId());

        assertThat(countRows(listingId, REQUESTER)).isEqualTo(2);
        assertThat(countRows(listingId, OTHER_REQUESTER)).isEqualTo(1);
    }

    // ---------------------------------------------------------------------------------------
    // (2) requesterMessage persisted
    // ---------------------------------------------------------------------------------------

    @Test
    @DisplayName("(2) requesterMessage is committed to viewing_requests.requester_message (raw SQL read-back)")
    void requesterMessage_isPersistedToTheColumn() {
        ViewingRequest saved = bookingService.createBooking(REQUESTER, listingId, tomorrow(), SLOT, MESSAGE);

        String stored = jdbcTemplate.queryForObject(
                "SELECT requester_message FROM viewing_requests WHERE id = ?", String.class, saved.getId());
        assertThat(stored).isEqualTo(MESSAGE);
    }

    // ---------------------------------------------------------------------------------------
    // (3) broker read path
    // ---------------------------------------------------------------------------------------

    @Test
    @DisplayName("(3) GET /api/bookings/broker (controller -> service -> repository) returns the saved requesterMessage")
    void brokerReadPath_returnsSavedMessage() {
        ViewingRequest saved = bookingService.createBooking(REQUESTER, listingId, tomorrow(), SLOT, MESSAGE);
        CallerInfo broker = new CallerInfo(BROKER, "broker", false);
        PageRequest page = PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "createdAt"));

        ResponseEntity<PagedResponse<BookingController.BookingResponse>> all = controller.dealer(broker, null, page);
        assertThat(all.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<BookingController.BookingResponse> items = all.getBody().items();
        assertThat(items).hasSize(1);
        assertThat(items.get(0).id()).isEqualTo(saved.getId());
        assertThat(items.get(0).requesterId()).isEqualTo(REQUESTER);
        assertThat(items.get(0).requesterMessage()).isEqualTo(MESSAGE);

        ResponseEntity<PagedResponse<BookingController.BookingResponse>> byListing =
                controller.dealer(broker, listingId, page);
        assertThat(byListing.getBody().items())
                .extracting(BookingController.BookingResponse::requesterMessage)
                .containsExactly(MESSAGE);
    }

    // ---------------------------------------------------------------------------------------

    private static LocalDate tomorrow() {
        return LocalDate.now().plusDays(1);
    }

    private int countRows(UUID listing, UUID requester) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM viewing_requests WHERE listing_id = ? AND requester_id = ?",
                Integer.class, listing, requester);
        return n == null ? -1 : n;
    }

    private UUID insertLiveListing(UUID ownerId) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO property_listings "
                        + "(id, created_by, area_key, property_type, listing_purpose, status, "
                        + " price_paise, is_duplicate, is_valid, created_at, updated_at) "
                        + "VALUES (?, ?, 'IN|KA|Udupi|Manipal', 'apartment', 'sale', 'LIVE', "
                        + "        50000000, false, true, ?, ?)",
                id, ownerId, now, now);
        return id;
    }
}
