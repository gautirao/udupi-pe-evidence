package com.example.realestate.savedsearch;

import com.example.realestate.discover.PolygonGeographicSafetyPolicy;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * #2019 Slice A (e526b4a6 review must-have): the create() idempotency RACE. Two concurrent,
 * equivalent creates must converge on ONE row and BOTH callers must receive it — never an
 * untranslated unique-index failure or an {@code UnexpectedRollbackException}.
 *
 * <p>Unlike {@code SavedSearchServiceIT}, this class runs WITHOUT a test-managed transaction
 * ({@code NOT_SUPPORTED}) and against the REAL Spring-proxied {@link SavedSearchService} /
 * {@link SavedSearchInserter} beans, because the property under test is transactional:
 * {@code REQUIRES_NEW} + {@code saveAndFlush} must raise the violation eagerly and leave the
 * outer transaction usable for the recovery lookup. Rows therefore genuinely commit and are
 * deleted in {@link #cleanUp()}.
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({SavedSearchService.class, SavedSearchInserter.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword="
})
class SavedSearchCreateIdempotencyRaceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    private static final UUID USER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-0000000000a1");

    /** Spied (not mocked): real JPA repository, with ONE lookup faked in the deterministic race. */
    @MockitoSpyBean
    private SavedSearchRepository savedSearchRepository;

    @Autowired
    private SavedSearchService service; // the real @Transactional proxy, wired to the real REQUIRES_NEW inserter

    @MockitoBean
    private PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    @AfterEach
    void cleanUp() {
        savedSearchRepository.deleteAll(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A));
    }

    private static SavedSearchService.CreateOutcome create(SavedSearchService s) {
        return s.create(
                USER_A, "bangalore", ResultScopeKind.AREA_SET,
                List.of("IN|KA|Bangalore|Indiranagar"), null,
                null, null, null, null,
                Map.of("priceMinPaise", 100), "race", null);
    }

    @Test
    @DisplayName("deterministic race through the real transactional proxy: lookup misses, insert collides with a committed winner, caller receives the winner (created=false)")
    void insertCollision_recoversWinnerInsteadOfFailing() {
        // Step 1: the "other request" wins — its row is committed before ours inserts.
        SavedSearchService.CreateOutcome winner = create(service);
        assertThat(winner.created()).isTrue();

        // Step 2: our request's pre-insert lookup MISSES (as it would have in the real race,
        // having run before the winner committed), so it proceeds to insert. Only that first
        // lookup is faked on the spied repository bean; the recovery lookup after the collision
        // is real. Everything else — the service's outer @Transactional, the inserter's
        // REQUIRES_NEW + flush, the exception translation — is the production wiring, which is
        // exactly what the pre-fix code got wrong (deferred INSERT, violation at outer commit,
        // untranslated failure instead of the winner).
        // (callRealMethod is unavailable on a spied repository INTERFACE, so the recovery
        // lookup is answered by an equivalent un-stubbed real query on the same spy.)
        AtomicInteger lookups = new AtomicInteger();
        doAnswer(invocation -> {
            if (lookups.getAndIncrement() == 0) {
                return Optional.empty();
            }
            UUID userId = invocation.getArgument(0);
            String fingerprint = invocation.getArgument(1);
            return savedSearchRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                    .filter(s -> s.getFingerprint().equals(fingerprint))
                    .findFirst();
        }).when(savedSearchRepository).findByUserIdAndFingerprint(any(), any());

        SavedSearchService.CreateOutcome loser = create(service);

        assertThat(loser.created()).as("the loser must not report a fresh creation").isFalse();
        assertThat(loser.savedSearch().getId()).isEqualTo(winner.savedSearch().getId());
        assertThat(lookups.get()).as("miss, then the recovery lookup").isEqualTo(2);
        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).hasSize(1);
    }

    @Test
    @DisplayName("two concurrent transactions with the same user+fingerprint, both past the pre-insert lookup before either inserts: exactly one row, both calls succeed, one created=true and one created=false, no raw exception")
    void concurrentEquivalentCreates_convergeToOneRow() throws Exception {
        // Both callers' PRE-INSERT lookups are held at a barrier and answered "empty" only once
        // both have arrived, so both transactions are provably past the lookup and race on the
        // INSERT itself. Postgres serialises the two inserts on the unique index: one commits,
        // the other's REQUIRES_NEW flush fails after the winner commits, and its recovery
        // lookup (a real query) must return the winner. Nothing is timing-dependent.
        CyclicBarrier bothPastLookup = new CyclicBarrier(2);
        AtomicInteger lookups = new AtomicInteger();
        doAnswer(invocation -> {
            if (lookups.getAndIncrement() < 2) {
                bothPastLookup.await(30, TimeUnit.SECONDS);
                return Optional.empty();
            }
            UUID userId = invocation.getArgument(0);
            String fingerprint = invocation.getArgument(1);
            return savedSearchRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                    .filter(s -> s.getFingerprint().equals(fingerprint))
                    .findFirst();
        }).when(savedSearchRepository).findByUserIdAndFingerprint(any(), any());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<SavedSearchService.CreateOutcome>> futures = List.of(
                    pool.submit(() -> create(service)),
                    pool.submit(() -> create(service)));

            // get() rethrows any raw constraint / rollback exception as an ExecutionException,
            // which fails the test — "both calls succeed" is asserted by these two lines.
            SavedSearchService.CreateOutcome first = futures.get(0).get(30, TimeUnit.SECONDS);
            SavedSearchService.CreateOutcome second = futures.get(1).get(30, TimeUnit.SECONDS);

            assertThat(first.savedSearch().getId()).isEqualTo(second.savedSearch().getId());
            assertThat(first.created() ^ second.created())
                    .as("exactly one caller created the row (created=true), the other received it (created=false)")
                    .isTrue();
            assertThat(lookups.get())
                    .as("two gated pre-insert misses, then exactly one recovery lookup by the loser")
                    .isEqualTo(3);
            assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).hasSize(1);
        } finally {
            pool.shutdownNow();
        }
    }
}
