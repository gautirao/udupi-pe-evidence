package com.example.realestate.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ViewingRequestRepository extends JpaRepository<ViewingRequest, UUID> {

    List<ViewingRequest> findByRequesterIdOrderByCreatedAtDesc(UUID requesterId);

    List<ViewingRequest> findByDealerIdAndStatusInOrderByCreatedAtDesc(UUID dealerId, List<String> statuses);

    Page<ViewingRequest> findByRequesterId(UUID requesterId, Pageable pageable);

    Page<ViewingRequest> findByDealerIdAndStatusIn(UUID dealerId, List<String> statuses, Pageable pageable);

    Page<ViewingRequest> findByDealerIdAndListingIdAndStatusIn(UUID dealerId, UUID listingId, List<String> statuses, Pageable pageable);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE ViewingRequest v SET v.status = 'CONFIRMED', v.updatedAt = :now WHERE v.id = :id AND v.status = :expectedStatus AND v.dealerId = :callerId")
    int confirmAtomic(@Param("id") UUID id, @Param("expectedStatus") String expectedStatus, @Param("callerId") UUID callerId, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE ViewingRequest v SET v.status = 'DECLINED', v.declineReason = :declineReason, v.updatedAt = :now WHERE v.id = :id AND v.status = :expectedStatus AND v.dealerId = :callerId")
    int declineAtomic(@Param("id") UUID id, @Param("expectedStatus") String expectedStatus, @Param("callerId") UUID callerId, @Param("declineReason") String declineReason, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE ViewingRequest v SET v.status = 'CANCELLED', v.cancelledBy = :cancelledBy, v.updatedAt = :now WHERE v.id = :id AND v.status IN :allowedStatuses AND (v.requesterId = :callerId OR v.dealerId = :callerId)")
    int cancelAtomic(@Param("id") UUID id, @Param("allowedStatuses") Collection<String> allowedStatuses, @Param("callerId") UUID callerId, @Param("cancelledBy") String cancelledBy, @Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE ViewingRequest v SET v.status = 'COMPLETED', v.updatedAt = :now WHERE v.status = 'CONFIRMED' AND v.requestedDate < :today")
    int transitionExpiredConfirmedToCompleted(@Param("now") OffsetDateTime now, @Param("today") LocalDate today);

    @Query(value = "SELECT p.email FROM public.profiles p WHERE p.user_id = :userId", nativeQuery = true)
    Optional<String> findEmailByUserId(@Param("userId") UUID userId);

    @Query(value = "SELECT p.full_name FROM public.profiles p WHERE p.user_id = :userId", nativeQuery = true)
    Optional<String> findFullNameByUserId(@Param("userId") UUID userId);
}
