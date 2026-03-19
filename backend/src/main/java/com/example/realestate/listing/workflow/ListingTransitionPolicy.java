package com.example.realestate.listing.workflow;

import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.exception.ListingStatusException;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Set;

/**
 * Centralized listing lifecycle transition policy.
 * <p>
 * Encodes the complete allowed-transition matrix from
 * {@code docs/LISTING_STATE_TRANSITIONS.md} section 9.
 * Every service method that changes listing status must delegate to
 * {@link #validate(ListingStatus, ListingStatus, ActorType)} before
 * persisting the change.
 * <p>
 * <b>Creation transitions excluded:</b> T-01 (new -> DRAFT) and T-30
 * (new -> SCRAPED) have a null {@code from} status and are validated at
 * creation time, not by this policy. They are intentionally absent from the
 * allowed set.
 * <p>
 * <b>DEALER = BROKER mapping:</b> The spec uses "DEALER" for the
 * broker/owner actor. In code this maps to {@link ActorType#BROKER}.
 */
@Component
public class ListingTransitionPolicy {

    /**
     * Immutable triple representing an allowed (from, to, actor) transition.
     */
    private record Transition(ListingStatus from, ListingStatus to, ActorType actor) {}

    /**
     * The complete set of non-creation transitions from the spec (T-02 through T-32,
     * excluding T-01 and T-30 which are creation transitions with null {@code from}).
     * <p>
     * 31 triples total. Each comment references the spec transition ID.
     */
    private static final Set<Transition> ALLOWED = Set.of(
            // --- BROKER (DEALER) transitions (T-02 through T-10) ---
            new Transition(ListingStatus.DRAFT,           ListingStatus.PENDING_REVIEW, ActorType.BROKER),  // T-02
            new Transition(ListingStatus.DRAFT,           ListingStatus.ARCHIVED,       ActorType.BROKER),  // T-03
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.DRAFT,          ActorType.BROKER),  // T-04
            new Transition(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.BROKER),  // T-05
            new Transition(ListingStatus.REJECTED,        ListingStatus.PENDING_REVIEW, ActorType.BROKER),  // T-XX (resubmit)
            new Transition(ListingStatus.REJECTED,        ListingStatus.DRAFT,          ActorType.BROKER),  // T-06
            new Transition(ListingStatus.REJECTED,        ListingStatus.ARCHIVED,       ActorType.BROKER),  // T-07
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.DRAFT,          ActorType.BROKER),  // T-08
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.PENDING_REVIEW, ActorType.BROKER),  // T-09
            // T-10: ARCHIVED -> LIVE for BROKER (fast-restore). Allowed at matrix level per spec.
            // Actual access is gated by the fast-restore guard (TODO: §10.4 guard implementation).
            // Design decision: the guard stub (not this matrix) controls whether the transition
            // actually executes. Blocking it here would prevent the guard from ever being reached.
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.LIVE,           ActorType.BROKER),  // T-10

            // --- ADMIN transitions (T-11 through T-29) ---
            new Transition(ListingStatus.SCRAPED,         ListingStatus.DRAFT,          ActorType.ADMIN),   // T-11
            new Transition(ListingStatus.SCRAPED,         ListingStatus.LIVE,           ActorType.ADMIN),   // T-12
            new Transition(ListingStatus.SCRAPED,         ListingStatus.REJECTED,       ActorType.ADMIN),   // T-13
            new Transition(ListingStatus.SCRAPED,         ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-14
            new Transition(ListingStatus.DRAFT,           ListingStatus.LIVE,           ActorType.ADMIN),   // T-15
            new Transition(ListingStatus.DRAFT,           ListingStatus.REJECTED,       ActorType.ADMIN),   // T-16
            new Transition(ListingStatus.DRAFT,           ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-17
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.LIVE,           ActorType.ADMIN),   // T-18
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.REJECTED,       ActorType.ADMIN),   // T-19
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.DRAFT,          ActorType.ADMIN),   // T-20
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-21
            new Transition(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-22
            new Transition(ListingStatus.LIVE,            ListingStatus.REJECTED,       ActorType.ADMIN),   // T-23
            new Transition(ListingStatus.REJECTED,        ListingStatus.DRAFT,          ActorType.ADMIN),   // T-24
            new Transition(ListingStatus.REJECTED,        ListingStatus.LIVE,           ActorType.ADMIN),   // T-25
            new Transition(ListingStatus.REJECTED,        ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-26
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.DRAFT,          ActorType.ADMIN),   // T-27
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.PENDING_REVIEW, ActorType.ADMIN),   // T-28
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.LIVE,           ActorType.ADMIN),   // T-29

            // --- SYSTEM transitions (T-31 and T-32) ---
            new Transition(ListingStatus.SCRAPED,         ListingStatus.ARCHIVED,       ActorType.SYSTEM),  // T-31
            new Transition(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.SYSTEM)   // T-32
    );

    /**
     * Validates that the transition {@code (from, to, actor)} is allowed by the
     * lifecycle matrix.
     * <p>
     * This method enforces structural validity only (is this triple in the allowed set?).
     * Business-level guards (completeness, fast-restore eligibility, reason codes) are
     * evaluated by the calling service <b>after</b> this check passes.
     *
     * @param from  the current listing status (must not be null; creation transitions are
     *              not validated here)
     * @param to    the target listing status (must not be null)
     * @param actor the actor performing the transition (must not be null)
     * @throws IllegalArgumentException if any argument is null
     * @throws ListingStatusException   if the transition is not allowed
     */
    public void validate(ListingStatus from, ListingStatus to, ActorType actor) {
        Objects.requireNonNull(from, "from status must not be null (creation transitions are not validated here)");
        Objects.requireNonNull(to, "to status must not be null");
        Objects.requireNonNull(actor, "actor must not be null");

        if (from == to) {
            throw new ListingStatusException(
                    "Self-transition not allowed: from=" + from + " to=" + to + " actor=" + actor);
        }

        if (!ALLOWED.contains(new Transition(from, to, actor))) {
            throw new ListingStatusException(
                    "Transition not allowed: from=" + from + " to=" + to + " actor=" + actor);
        }
    }

    // -----------------------------------------------------------------------
    // Guard stubs — TODO: implement in future phases
    // -----------------------------------------------------------------------

    /**
     * Completeness guard: validates that a listing has all required fields before
     * entering PENDING_REVIEW or LIVE.
     * <p>
     * Applies to transitions: T-02, T-09, T-12, T-15, T-18, T-25, T-28.
     *
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Spec section 10.2</a>
     * TODO: RE-??? — implement completeness validation
     */
    @SuppressWarnings("unused")
    void guardCompleteness(Object listing) {
        // Stub — will validate title, description, location, asset type,
        // price/rent, address_confirmed, media count, fraud flags
    }

    /**
     * Fast-restore eligibility guard: validates that an ARCHIVED listing may be
     * restored directly to LIVE without re-moderation.
     * <p>
     * Applies to transitions: T-10 (BROKER), T-29 (ADMIN).
     * Checks: previously published, snapshot match, compliance currency,
     * actor authority, account standing.
     *
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Spec section 10.4</a>
     * TODO: RE-??? — implement fast-restore guard
     */
    @SuppressWarnings("unused")
    void guardFastRestore(Object listing) {
        // Stub — will compare current fields against last_approved_snapshot,
        // verify compliance currency, account standing
    }

    /**
     * Submission count gate: tracks how many times a listing has been submitted
     * for review, and prevents withdrawal after admin has taken terminal action
     * on the current submission.
     *
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Spec section 10.5</a>
     * TODO: RE-??? — implement submission count gate
     */
    @SuppressWarnings("unused")
    void guardSubmissionCount(Object listing) {
        // Stub — will check listing.submission_count vs
        // listing_status_history.actioned_submission_count
    }

    /**
     * Reason code required guard: enforces that transitions into REJECTED always
     * carry a non-null reason code.
     *
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Invariant I-03</a>
     * TODO: RE-??? — implement reason code validation
     */
    @SuppressWarnings("unused")
    void guardReasonCodeRequired(String reasonCode) {
        // Stub — will throw if reasonCode is null or blank when
        // target status is REJECTED
    }
}
