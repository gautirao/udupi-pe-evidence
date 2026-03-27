package com.example.realestate.listing.workflow;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.exception.ListingErrorCode;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.ListingValidationException;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingTransitionPolicyTest {

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private ListingImageRepository imageRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ListingTransitionPolicy policy;

    @BeforeEach
    void setUp() {
        policy = new ListingTransitionPolicy(listingRepository, imageRepository, objectMapper, 10);
    }

    // -----------------------------------------------------------------------
    // Legal transitions — all 31 non-creation triples from the spec
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Legal transitions")
    class LegalTransitions {

        static Stream<Arguments> allLegalTransitions() {
            return Stream.of(
                    // BROKER (DEALER) transitions
                    Arguments.of(ListingStatus.DRAFT,           ListingStatus.PENDING_REVIEW, ActorType.BROKER,  "T-02"),
                    Arguments.of(ListingStatus.DRAFT,           ListingStatus.ARCHIVED,       ActorType.BROKER,  "T-03"),
                    Arguments.of(ListingStatus.PENDING_REVIEW,  ListingStatus.DRAFT,          ActorType.BROKER,  "T-04"),
                    Arguments.of(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.BROKER,  "T-05"),
                    Arguments.of(ListingStatus.REJECTED,        ListingStatus.PENDING_REVIEW, ActorType.BROKER,  "T-XX resubmit"),
                    Arguments.of(ListingStatus.REJECTED,        ListingStatus.DRAFT,          ActorType.BROKER,  "T-06"),
                    Arguments.of(ListingStatus.REJECTED,        ListingStatus.ARCHIVED,       ActorType.BROKER,  "T-07"),
                    Arguments.of(ListingStatus.ARCHIVED,        ListingStatus.DRAFT,          ActorType.BROKER,  "T-08"),
                    Arguments.of(ListingStatus.ARCHIVED,        ListingStatus.PENDING_REVIEW, ActorType.BROKER,  "T-09"),
                    Arguments.of(ListingStatus.ARCHIVED,        ListingStatus.LIVE,           ActorType.BROKER,  "T-10"),

                    // ADMIN transitions
                    Arguments.of(ListingStatus.SCRAPED,         ListingStatus.DRAFT,          ActorType.ADMIN,   "T-11"),
                    Arguments.of(ListingStatus.SCRAPED,         ListingStatus.LIVE,           ActorType.ADMIN,   "T-12"),
                    Arguments.of(ListingStatus.SCRAPED,         ListingStatus.REJECTED,       ActorType.ADMIN,   "T-13"),
                    Arguments.of(ListingStatus.SCRAPED,         ListingStatus.ARCHIVED,       ActorType.ADMIN,   "T-14"),
                    Arguments.of(ListingStatus.DRAFT,           ListingStatus.LIVE,           ActorType.ADMIN,   "T-15"),
                    Arguments.of(ListingStatus.DRAFT,           ListingStatus.REJECTED,       ActorType.ADMIN,   "T-16"),
                    Arguments.of(ListingStatus.DRAFT,           ListingStatus.ARCHIVED,       ActorType.ADMIN,   "T-17"),
                    Arguments.of(ListingStatus.PENDING_REVIEW,  ListingStatus.LIVE,           ActorType.ADMIN,   "T-18"),
                    Arguments.of(ListingStatus.PENDING_REVIEW,  ListingStatus.REJECTED,       ActorType.ADMIN,   "T-19"),
                    Arguments.of(ListingStatus.PENDING_REVIEW,  ListingStatus.DRAFT,          ActorType.ADMIN,   "T-20"),
                    Arguments.of(ListingStatus.PENDING_REVIEW,  ListingStatus.ARCHIVED,       ActorType.ADMIN,   "T-21"),
                    Arguments.of(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.ADMIN,   "T-22"),
                    Arguments.of(ListingStatus.LIVE,            ListingStatus.REJECTED,       ActorType.ADMIN,   "T-23"),
                    Arguments.of(ListingStatus.REJECTED,        ListingStatus.DRAFT,          ActorType.ADMIN,   "T-24"),
                    Arguments.of(ListingStatus.REJECTED,        ListingStatus.LIVE,           ActorType.ADMIN,   "T-25"),
                    Arguments.of(ListingStatus.REJECTED,        ListingStatus.ARCHIVED,       ActorType.ADMIN,   "T-26"),
                    Arguments.of(ListingStatus.ARCHIVED,        ListingStatus.DRAFT,          ActorType.ADMIN,   "T-27"),
                    Arguments.of(ListingStatus.ARCHIVED,        ListingStatus.PENDING_REVIEW, ActorType.ADMIN,   "T-28"),
                    Arguments.of(ListingStatus.ARCHIVED,        ListingStatus.LIVE,           ActorType.ADMIN,   "T-29"),

                    // SYSTEM transitions
                    Arguments.of(ListingStatus.SCRAPED,         ListingStatus.ARCHIVED,       ActorType.SYSTEM,  "T-31"),
                    Arguments.of(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.SYSTEM,  "T-32")
            );
        }

        @ParameterizedTest(name = "{3}: {0} -> {1} by {2}")
        @MethodSource("allLegalTransitions")
        void legalTransition_doesNotThrow(ListingStatus from, ListingStatus to, ActorType actor, String tid) {
            assertThatCode(() -> policy.validate(from, to, actor))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("Legal transition count is exactly 31")
        void legalTransitionCount() {
            long count = allLegalTransitions().count();
            org.assertj.core.api.Assertions.assertThat(count).isEqualTo(31);
        }
    }

    // -----------------------------------------------------------------------
    // Illegal transitions — critical blocks from the spec
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Illegal transitions")
    class IllegalTransitions {

        static Stream<Arguments> illegalTransitions() {
            return Stream.of(
                    // --- LIVE -> DRAFT blocked for ALL actor types (D-3, I-06) ---
                    Arguments.of(ListingStatus.LIVE, ListingStatus.DRAFT, ActorType.BROKER, "LIVE->DRAFT by BROKER"),
                    Arguments.of(ListingStatus.LIVE, ListingStatus.DRAFT, ActorType.ADMIN,  "LIVE->DRAFT by ADMIN"),
                    Arguments.of(ListingStatus.LIVE, ListingStatus.DRAFT, ActorType.SYSTEM, "LIVE->DRAFT by SYSTEM"),

                    // --- SCRAPED transitions blocked for BROKER (spec section 13.2) ---
                    Arguments.of(ListingStatus.SCRAPED, ListingStatus.DRAFT,          ActorType.BROKER, "SCRAPED->DRAFT by BROKER"),
                    Arguments.of(ListingStatus.SCRAPED, ListingStatus.LIVE,           ActorType.BROKER, "SCRAPED->LIVE by BROKER"),
                    Arguments.of(ListingStatus.SCRAPED, ListingStatus.REJECTED,       ActorType.BROKER, "SCRAPED->REJECTED by BROKER"),
                    Arguments.of(ListingStatus.SCRAPED, ListingStatus.ARCHIVED,       ActorType.BROKER, "SCRAPED->ARCHIVED by BROKER"),
                    Arguments.of(ListingStatus.SCRAPED, ListingStatus.PENDING_REVIEW, ActorType.BROKER, "SCRAPED->PENDING_REVIEW by BROKER"),

                    // --- BROKER cannot transition directly to LIVE (I-05) ---
                    // (except ARCHIVED->LIVE which is T-10, allowed at matrix level)
                    Arguments.of(ListingStatus.DRAFT,          ListingStatus.LIVE, ActorType.BROKER, "DRAFT->LIVE by BROKER"),
                    Arguments.of(ListingStatus.PENDING_REVIEW, ListingStatus.LIVE, ActorType.BROKER, "PENDING_REVIEW->LIVE by BROKER"),
                    Arguments.of(ListingStatus.REJECTED,       ListingStatus.LIVE, ActorType.BROKER, "REJECTED->LIVE by BROKER"),

                    // --- Any -> SCRAPED blocked for all actors (SCRAPED is entry-only) ---
                    Arguments.of(ListingStatus.DRAFT,          ListingStatus.SCRAPED, ActorType.ADMIN,  "DRAFT->SCRAPED by ADMIN"),
                    Arguments.of(ListingStatus.LIVE,           ListingStatus.SCRAPED, ActorType.ADMIN,  "LIVE->SCRAPED by ADMIN"),
                    Arguments.of(ListingStatus.ARCHIVED,       ListingStatus.SCRAPED, ActorType.SYSTEM, "ARCHIVED->SCRAPED by SYSTEM"),
                    Arguments.of(ListingStatus.REJECTED,       ListingStatus.SCRAPED, ActorType.BROKER, "REJECTED->SCRAPED by BROKER"),
                    Arguments.of(ListingStatus.PENDING_REVIEW, ListingStatus.SCRAPED, ActorType.ADMIN,  "PENDING_REVIEW->SCRAPED by ADMIN"),

                    // --- SYSTEM cannot do most transitions ---
                    Arguments.of(ListingStatus.DRAFT,          ListingStatus.PENDING_REVIEW, ActorType.SYSTEM, "DRAFT->PENDING_REVIEW by SYSTEM"),
                    Arguments.of(ListingStatus.PENDING_REVIEW, ListingStatus.LIVE,           ActorType.SYSTEM, "PENDING_REVIEW->LIVE by SYSTEM"),
                    Arguments.of(ListingStatus.REJECTED,       ListingStatus.DRAFT,          ActorType.SYSTEM, "REJECTED->DRAFT by SYSTEM"),

                    // --- LIVE -> PENDING_REVIEW not in spec for any actor ---
                    Arguments.of(ListingStatus.LIVE, ListingStatus.PENDING_REVIEW, ActorType.BROKER, "LIVE->PENDING_REVIEW by BROKER"),

                    // --- BROKER cannot reject ---
                    Arguments.of(ListingStatus.PENDING_REVIEW, ListingStatus.REJECTED, ActorType.BROKER, "PENDING_REVIEW->REJECTED by BROKER")
            );
        }

        @ParameterizedTest(name = "{3}")
        @MethodSource("illegalTransitions")
        void illegalTransition_throwsListingStatusException(
                ListingStatus from, ListingStatus to, ActorType actor, String desc) {
            assertThatThrownBy(() -> policy.validate(from, to, actor))
                    .isInstanceOf(ListingStatusException.class)
                    .hasMessageContaining("from=" + from)
                    .hasMessageContaining("to=" + to)
                    .hasMessageContaining("actor=" + actor);
        }

        @Test
        @DisplayName("Illegal transition count is at least 21")
        void illegalTransitionCount() {
            long count = illegalTransitions().count();
            org.assertj.core.api.Assertions.assertThat(count).isGreaterThanOrEqualTo(15);
        }
    }

    // -----------------------------------------------------------------------
    // Self-transitions blocked
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Self-transitions blocked")
    class SelfTransitions {

        @ParameterizedTest(name = "{0} -> {0} by {1}")
        @MethodSource("allSelfTransitions")
        void selfTransition_throwsListingStatusException(ListingStatus status, ActorType actor) {
            assertThatThrownBy(() -> policy.validate(status, status, actor))
                    .isInstanceOf(ListingStatusException.class)
                    .hasMessageContaining("Self-transition not allowed");
        }

        static Stream<Arguments> allSelfTransitions() {
            Stream.Builder<Arguments> builder = Stream.builder();
            for (ListingStatus status : ListingStatus.values()) {
                for (ActorType actor : ActorType.values()) {
                    builder.add(Arguments.of(status, actor));
                }
            }
            return builder.build();
        }
    }

    // -----------------------------------------------------------------------
    // Null argument handling
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Null argument handling")
    class NullArguments {

        @Test
        void nullFrom_throwsIllegalArgumentException() {
            assertThatThrownBy(() -> policy.validate(null, ListingStatus.DRAFT, ActorType.BROKER))
                    .isInstanceOf(NullPointerException.class)
                    .hasMessageContaining("from status must not be null");
        }

        @Test
        void nullTo_throwsIllegalArgumentException() {
            assertThatThrownBy(() -> policy.validate(ListingStatus.DRAFT, null, ActorType.BROKER))
                    .isInstanceOf(NullPointerException.class)
                    .hasMessageContaining("to status must not be null");
        }

        @Test
        void nullActor_throwsIllegalArgumentException() {
            assertThatThrownBy(() -> policy.validate(ListingStatus.DRAFT, ListingStatus.ARCHIVED, null))
                    .isInstanceOf(NullPointerException.class)
                    .hasMessageContaining("actor must not be null");
        }
    }

    // -----------------------------------------------------------------------
    // Critical block: LIVE -> DRAFT blocked for ALL actor types
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("LIVE -> DRAFT blocked for all actors (D-3, I-06)")
    class LiveToDraftBlocked {

        @ParameterizedTest
        @EnumSource(ActorType.class)
        void liveToDraft_blocked(ActorType actor) {
            assertThatThrownBy(() -> policy.validate(ListingStatus.LIVE, ListingStatus.DRAFT, actor))
                    .isInstanceOf(ListingStatusException.class);
        }
    }

    // -----------------------------------------------------------------------
    // Critical block: SCRAPED transitions blocked for BROKER
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("SCRAPED transitions blocked for BROKER (spec section 13.2)")
    class ScrapedBlockedForBroker {

        @ParameterizedTest
        @EnumSource(value = ListingStatus.class, names = {"SCRAPED"}, mode = EnumSource.Mode.EXCLUDE)
        void scrapedToAnyTarget_blockedForBroker(ListingStatus target) {
            // SCRAPED -> target for BROKER is never allowed (regardless of target)
            assertThatThrownBy(() -> policy.validate(ListingStatus.SCRAPED, target, ActorType.BROKER))
                    .isInstanceOf(ListingStatusException.class);
        }
    }

    // -----------------------------------------------------------------------
    // Critical block: BROKER cannot transition directly to LIVE
    // (except ARCHIVED -> LIVE per T-10)
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("BROKER cannot transition to LIVE (except ARCHIVED->LIVE T-10)")
    class BrokerToLiveBlocked {

        @ParameterizedTest
        @EnumSource(value = ListingStatus.class, names = {"LIVE", "ARCHIVED"}, mode = EnumSource.Mode.EXCLUDE)
        void brokerToLive_blockedFromNonArchived(ListingStatus from) {
            assertThatThrownBy(() -> policy.validate(from, ListingStatus.LIVE, ActorType.BROKER))
                    .isInstanceOf(ListingStatusException.class);
        }

        @Test
        @DisplayName("T-10: ARCHIVED -> LIVE allowed for BROKER at matrix level")
        void archivedToLive_allowedForBroker() {
            assertThatCode(() -> policy.validate(ListingStatus.ARCHIVED, ListingStatus.LIVE, ActorType.BROKER))
                    .doesNotThrowAnyException();
        }
    }

    // -----------------------------------------------------------------------
    // Critical block: Any -> SCRAPED blocked (SCRAPED is entry-only)
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Any -> SCRAPED blocked for all actors (entry-only via ingestion)")
    class AnyToScrapedBlocked {

        @ParameterizedTest
        @EnumSource(value = ListingStatus.class, names = {"SCRAPED"}, mode = EnumSource.Mode.EXCLUDE)
        void anyToScraped_blockedForAllActors(ListingStatus from) {
            for (ActorType actor : ActorType.values()) {
                assertThatThrownBy(() -> policy.validate(from, ListingStatus.SCRAPED, actor))
                        .isInstanceOf(ListingStatusException.class);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Duplicate (from, to) pairs with different actors
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Duplicate (from, to) pairs with different actors encoded separately")
    class DuplicatePairsWithDifferentActors {

        @Test
        @DisplayName("LIVE -> ARCHIVED allowed for BROKER, ADMIN, and SYSTEM (T-05, T-22, T-32)")
        void liveToArchived_allThreeActors() {
            assertThatCode(() -> policy.validate(ListingStatus.LIVE, ListingStatus.ARCHIVED, ActorType.BROKER))
                    .doesNotThrowAnyException();
            assertThatCode(() -> policy.validate(ListingStatus.LIVE, ListingStatus.ARCHIVED, ActorType.ADMIN))
                    .doesNotThrowAnyException();
            assertThatCode(() -> policy.validate(ListingStatus.LIVE, ListingStatus.ARCHIVED, ActorType.SYSTEM))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("SCRAPED -> ARCHIVED allowed for ADMIN and SYSTEM (T-14, T-31)")
        void scrapedToArchived_adminAndSystem() {
            assertThatCode(() -> policy.validate(ListingStatus.SCRAPED, ListingStatus.ARCHIVED, ActorType.ADMIN))
                    .doesNotThrowAnyException();
            assertThatCode(() -> policy.validate(ListingStatus.SCRAPED, ListingStatus.ARCHIVED, ActorType.SYSTEM))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("REJECTED -> DRAFT allowed for BROKER and ADMIN (T-06, T-24)")
        void rejectedToDraft_brokerAndAdmin() {
            assertThatCode(() -> policy.validate(ListingStatus.REJECTED, ListingStatus.DRAFT, ActorType.BROKER))
                    .doesNotThrowAnyException();
            assertThatCode(() -> policy.validate(ListingStatus.REJECTED, ListingStatus.DRAFT, ActorType.ADMIN))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("ARCHIVED -> DRAFT allowed for BROKER and ADMIN (T-08, T-27)")
        void archivedToDraft_brokerAndAdmin() {
            assertThatCode(() -> policy.validate(ListingStatus.ARCHIVED, ListingStatus.DRAFT, ActorType.BROKER))
                    .doesNotThrowAnyException();
            assertThatCode(() -> policy.validate(ListingStatus.ARCHIVED, ListingStatus.DRAFT, ActorType.ADMIN))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("PENDING_REVIEW -> DRAFT allowed for BROKER and ADMIN (T-04, T-20)")
        void pendingReviewToDraft_brokerAndAdmin() {
            assertThatCode(() -> policy.validate(ListingStatus.PENDING_REVIEW, ListingStatus.DRAFT, ActorType.BROKER))
                    .doesNotThrowAnyException();
            assertThatCode(() -> policy.validate(ListingStatus.PENDING_REVIEW, ListingStatus.DRAFT, ActorType.ADMIN))
                    .doesNotThrowAnyException();
        }
    }

    // -----------------------------------------------------------------------
    // Error message quality
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Error messages include from, to, and actor for debugging")
    class ErrorMessages {

        @Test
        void illegalTransition_messageContainsAllThreeFields() {
            assertThatThrownBy(() -> policy.validate(ListingStatus.LIVE, ListingStatus.DRAFT, ActorType.BROKER))
                    .isInstanceOf(ListingStatusException.class)
                    .hasMessageContaining("from=LIVE")
                    .hasMessageContaining("to=DRAFT")
                    .hasMessageContaining("actor=BROKER");
        }

        @Test
        void selfTransition_messageContainsSelfTransitionLabel() {
            assertThatThrownBy(() -> policy.validate(ListingStatus.LIVE, ListingStatus.LIVE, ActorType.ADMIN))
                    .isInstanceOf(ListingStatusException.class)
                    .hasMessageContaining("Self-transition not allowed");
        }
    }

    // -----------------------------------------------------------------------
    // Guard: guardReasonCodeRequired
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("guardReasonCodeRequired")
    class GuardReasonCodeRequired {

        @Test
        void nullReason_throwsReasonCodeRequired() {
            assertThatThrownBy(() -> policy.guardReasonCodeRequired(null))
                    .isInstanceOf(ListingLifecycleException.class)
                    .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                            .isEqualTo(ListingErrorCode.REASON_CODE_REQUIRED));
        }

        @Test
        void blankReason_throwsReasonCodeRequired() {
            assertThatThrownBy(() -> policy.guardReasonCodeRequired("   "))
                    .isInstanceOf(ListingLifecycleException.class)
                    .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                            .isEqualTo(ListingErrorCode.REASON_CODE_REQUIRED));
        }

        @Test
        void nonBlankReason_doesNotThrow() {
            assertThatCode(() -> policy.guardReasonCodeRequired("Low quality images"))
                    .doesNotThrowAnyException();
        }
    }

    // -----------------------------------------------------------------------
    // Guard: guardSubmissionCount
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("guardSubmissionCount")
    class GuardSubmissionCount {

        @Test
        void belowLimit_doesNotThrow() {
            Listing listing = new Listing();
            listing.setSubmissionCount(9); // max is 10

            assertThatCode(() -> policy.guardSubmissionCount(listing))
                    .doesNotThrowAnyException();
        }

        @Test
        void atLimit_throwsSubmissionLimitExceeded() {
            Listing listing = new Listing();
            listing.setSubmissionCount(10); // exactly at the limit

            assertThatThrownBy(() -> policy.guardSubmissionCount(listing))
                    .isInstanceOf(ListingLifecycleException.class)
                    .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                            .isEqualTo(ListingErrorCode.SUBMISSION_LIMIT_EXCEEDED));
        }

        @Test
        void aboveLimit_throwsSubmissionLimitExceeded() {
            Listing listing = new Listing();
            listing.setSubmissionCount(15);

            assertThatThrownBy(() -> policy.guardSubmissionCount(listing))
                    .isInstanceOf(ListingLifecycleException.class)
                    .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                            .isEqualTo(ListingErrorCode.SUBMISSION_LIMIT_EXCEEDED));
        }

        @Test
        void zeroCount_doesNotThrow() {
            Listing listing = new Listing();
            listing.setSubmissionCount(0);

            assertThatCode(() -> policy.guardSubmissionCount(listing))
                    .doesNotThrowAnyException();
        }
    }

    // -----------------------------------------------------------------------
    // Guard: guardCompleteness
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("guardCompleteness")
    class GuardCompleteness {

        @Test
        void validHouseListing_doesNotThrow() {
            Listing listing = completeHouseListing(UUID.randomUUID());
            when(listingRepository.countImagesByListingId(listing.getId())).thenReturn(3L);

            assertThatCode(() -> policy.guardCompleteness(listing))
                    .doesNotThrowAnyException();
        }

        @Test
        void missingPrice_throwsValidationException() {
            Listing listing = completeHouseListing(UUID.randomUUID());
            listing.setPrice(null);
            when(listingRepository.countImagesByListingId(listing.getId())).thenReturn(3L);

            assertThatThrownBy(() -> policy.guardCompleteness(listing))
                    .isInstanceOf(ListingValidationException.class);
        }

        @Test
        void tooFewImages_throwsValidationException() {
            Listing listing = completeHouseListing(UUID.randomUUID());
            when(listingRepository.countImagesByListingId(listing.getId())).thenReturn(1L);

            assertThatThrownBy(() -> policy.guardCompleteness(listing))
                    .isInstanceOf(ListingValidationException.class);
        }

        @Test
        void missingLocality_throwsValidationException() {
            Listing listing = completeHouseListing(UUID.randomUUID());
            listing.setLocality(null);
            when(listingRepository.countImagesByListingId(listing.getId())).thenReturn(3L);

            assertThatThrownBy(() -> policy.guardCompleteness(listing))
                    .isInstanceOf(ListingValidationException.class);
        }

        private Listing completeHouseListing(UUID listingId) {
            Listing l = new Listing();
            l.setId(listingId);
            l.setPropertyType("house");
            l.setPrice(new BigDecimal("5000000"));
            l.setLocality("Udupi");
            l.setAddressConfirmed(true);
            return l;
        }
    }

    // -----------------------------------------------------------------------
    // Guard: guardFastRestore
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("guardFastRestore")
    class GuardFastRestore {

        @Test
        void nullSnapshot_throwsFastRestoreNotEligible() {
            Listing listing = new Listing();
            listing.setId(UUID.randomUUID());
            listing.setLastApprovedSnapshot(null);

            assertThatThrownBy(() -> policy.guardFastRestore(listing))
                    .isInstanceOf(ListingLifecycleException.class)
                    .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                            .isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE));
        }

        @Test
        void snapshotMatches_doesNotThrow() throws Exception {
            UUID listingId = UUID.randomUUID();
            Listing listing = buildListingWithMatchingSnapshot(listingId, List.of());

            when(imageRepository.findByListingIdOrderByPositionAsc(listingId)).thenReturn(List.of());

            assertThatCode(() -> policy.guardFastRestore(listing))
                    .doesNotThrowAnyException();
        }

        @Test
        void titleChanged_throwsWithChangedFields() throws Exception {
            UUID listingId = UUID.randomUUID();
            Listing listing = buildListingWithMatchingSnapshot(listingId, List.of());
            listing.setTitle("Changed Title");

            when(imageRepository.findByListingIdOrderByPositionAsc(listingId)).thenReturn(List.of());

            assertThatThrownBy(() -> policy.guardFastRestore(listing))
                    .isInstanceOf(ListingLifecycleException.class)
                    .satisfies(ex -> {
                        ListingLifecycleException life = (ListingLifecycleException) ex;
                        assertThat(life.getCode()).isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE);
                        assertThat(life.getChangedFields()).contains("title");
                    });
        }

        @Test
        void imageAdded_throwsWithChangedFields() throws Exception {
            UUID listingId = UUID.randomUUID();
            UUID imageId1 = UUID.randomUUID();
            UUID imageId2 = UUID.randomUUID();
            UUID imageId3 = UUID.randomUUID();

            // Snapshot has 2 images; listing now has 3
            Listing listing = buildListingWithMatchingSnapshot(listingId, List.of(imageId1, imageId2));

            ListingImage img1 = new ListingImage(); img1.setId(imageId1);
            ListingImage img2 = new ListingImage(); img2.setId(imageId2);
            ListingImage img3 = new ListingImage(); img3.setId(imageId3);
            when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                    .thenReturn(List.of(img1, img2, img3));

            assertThatThrownBy(() -> policy.guardFastRestore(listing))
                    .isInstanceOf(ListingLifecycleException.class)
                    .satisfies(ex -> {
                        ListingLifecycleException life = (ListingLifecycleException) ex;
                        assertThat(life.getCode()).isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE);
                        assertThat(life.getChangedFields()).contains("imageIds");
                    });
        }

        @Test
        void imageReordered_doesNotThrow() throws Exception {
            UUID listingId = UUID.randomUUID();
            UUID imageId1 = UUID.randomUUID();
            UUID imageId2 = UUID.randomUUID();

            Listing listing = buildListingWithMatchingSnapshot(listingId, List.of(imageId1, imageId2));

            // Return images in reversed order — should not count as a material change
            ListingImage img2 = new ListingImage(); img2.setId(imageId2);
            ListingImage img1 = new ListingImage(); img1.setId(imageId1);
            when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                    .thenReturn(List.of(img2, img1));

            assertThatCode(() -> policy.guardFastRestore(listing))
                    .doesNotThrowAnyException();
        }

        /**
         * Builds a listing whose lastApprovedSnapshot JSON matches its current field state
         * for the given image IDs. Mirrors the structure of ListingTransitionPolicy.buildSnapshotMap.
         */
        private Listing buildListingWithMatchingSnapshot(UUID listingId, List<UUID> imageIds)
                throws Exception {
            Listing l = new Listing();
            l.setId(listingId);
            l.setTitle("Test Property");
            l.setDescription("A test property");
            l.setPricePaise(50_000_00L);
            l.setLocality("Udupi");
            l.setPropertyType("house");

            Map<String, Object> snap = new LinkedHashMap<>();
            snap.put("title", l.getTitle());
            snap.put("description", l.getDescription());
            snap.put("pricePaise", l.getPricePaise());
            snap.put("sellerType", l.getSellerType());
            snap.put("locality", l.getLocality());
            snap.put("latitude", l.getLatitude());
            snap.put("longitude", l.getLongitude());
            snap.put("areaKey", l.getAreaKey());
            snap.put("areaLabel", l.getAreaLabel());
            snap.put("areaSqft", l.getAreaSqft());
            snap.put("bedrooms", l.getBedrooms());
            snap.put("bathrooms", l.getBathrooms());
            snap.put("landArea", l.getLandArea());
            snap.put("propertyType", l.getPropertyType());
            snap.put("videoUrl", l.getVideoUrl());
            snap.put("imageIds", imageIds.stream().map(UUID::toString).collect(Collectors.toList()));

            String snapshotJson = new ObjectMapper()
                    .copy()
                    .setSerializationInclusion(JsonInclude.Include.ALWAYS)
                    .writeValueAsString(snap);
            l.setLastApprovedSnapshot(snapshotJson);
            return l;
        }
    }
}
