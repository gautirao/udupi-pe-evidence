package com.example.realestate.savedsearch;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedSearchRepository extends JpaRepository<SavedSearch, UUID> {

    Optional<SavedSearch> findByIdAndUserId(UUID id, UUID userId);

    List<SavedSearch> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedSearch> findByUserIdAndFingerprint(UUID userId, String fingerprint);

    long countByUserIdAndStatus(UUID userId, SavedSearchStatus status);
}
