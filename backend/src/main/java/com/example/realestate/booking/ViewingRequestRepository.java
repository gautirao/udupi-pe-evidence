package com.example.realestate.booking;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ViewingRequestRepository extends JpaRepository<ViewingRequest, UUID> {

    List<ViewingRequest> findByRequesterIdOrderByCreatedAtDesc(UUID requesterId);

    List<ViewingRequest> findByDealerIdAndStatusInOrderByCreatedAtDesc(UUID dealerId, List<String> statuses);
}
