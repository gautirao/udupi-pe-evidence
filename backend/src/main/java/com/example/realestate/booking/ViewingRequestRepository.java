package com.example.realestate.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ViewingRequestRepository extends JpaRepository<ViewingRequest, UUID> {

    List<ViewingRequest> findByRequesterIdOrderByCreatedAtDesc(UUID requesterId);

    List<ViewingRequest> findByBrokerIdAndStatusInOrderByCreatedAtDesc(UUID brokerId, List<String> statuses);

    Page<ViewingRequest> findByRequesterId(UUID requesterId, Pageable pageable);

    Page<ViewingRequest> findByBrokerIdAndStatusIn(UUID brokerId, List<String> statuses, Pageable pageable);

    Page<ViewingRequest> findByBrokerIdAndListingIdAndStatusIn(UUID brokerId, UUID listingId, List<String> statuses, Pageable pageable);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE ViewingRequest v SET v.status = 'CONFIRMED', v.updatedAt = :now WHERE v.id = :id AND v.status = :expectedStatus AND v.brokerId = :callerId")
    int confirmAtomic(@Param("id") UUID id, @Param("expectedStatus") String expectedStatus, @Param("callerId") UUID callerId, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE ViewingRequest v SET v.status = 'DECLINED', v.declineReason = :declineReason, v.updatedAt = :now WHERE v.id = :id AND v.status = :expectedStatus AND v.brokerId = :callerId")
    int declineAtomic(@Param("id") UUID id, @Param("expectedStatus") String expectedStatus, @Param("callerId") UUID callerId, @Param("declineReason") String declineReason, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE ViewingRequest v SET v.status = 'CANCELLED', v.cancelledBy = :cancelledBy, v.updatedAt = :now WHERE v.id = :id AND v.status IN :allowedStatuses AND (v.requesterId = :callerId OR v.brokerId = :callerId)")
    int cancelAtomic(@Param("id") UUID id, @Param("allowedStatuses") Collection<String> allowedStatuses, @Param("callerId") UUID callerId, @Param("cancelledBy") String cancelledBy, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE ViewingRequest v SET v.status = 'COMPLETED', v.updatedAt = :now WHERE v.status = 'CONFIRMED' AND v.requestedDate < :today")
    int transitionExpiredConfirmedToCompleted(@Param("now") OffsetDateTime now, @Param("today") LocalDate today);

    // CANCELLED_BY_SYSTEM = "system" — JPQL string literals cannot reference Java constants;
    // see BookingCascadeService.CANCELLED_BY_SYSTEM for the authoritative value.
    @Modifying(clearAutomatically = true)
    @Query("UPDATE ViewingRequest v SET v.status = 'CANCELLED', v.cancellationReason = :cancellationReason, v.cancelledBy = 'system', v.updatedAt = :now WHERE v.listingId = :listingId AND v.status = 'REQUESTED'")
    int bulkCancelRequested(@Param("listingId") UUID listingId, @Param("cancellationReason") String cancellationReason, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE ViewingRequest v SET v.status = 'NEEDS_RESOLUTION', v.cancellationReason = :cancellationReason, v.updatedAt = :now WHERE v.listingId = :listingId AND v.status = 'CONFIRMED'")
    int bulkFreezeConfirmed(@Param("listingId") UUID listingId, @Param("cancellationReason") String cancellationReason, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE ViewingRequest v SET v.status = 'CONFIRMED', v.cancellationReason = NULL, v.updatedAt = :now WHERE v.listingId = :listingId AND v.status = 'NEEDS_RESOLUTION'")
    int bulkUnfreeze(@Param("listingId") UUID listingId, @Param("now") OffsetDateTime now);

    @Query(value = "SELECT p.email FROM public.profiles p WHERE p.user_id = :userId", nativeQuery = true)
    Optional<String> findEmailByUserId(@Param("userId") UUID userId);

    @Query(value = "SELECT p.full_name FROM public.profiles p WHERE p.user_id = :userId", nativeQuery = true)
    Optional<String> findFullNameByUserId(@Param("userId") UUID userId);
}
