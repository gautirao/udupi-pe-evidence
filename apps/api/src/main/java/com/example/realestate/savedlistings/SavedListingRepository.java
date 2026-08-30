package com.example.realestate.savedlistings;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SavedListingRepository extends JpaRepository<SavedListing, UUID> {

    boolean existsByUserIdAndListingId(UUID userId, UUID listingId);

    Optional<SavedListing> findByUserIdAndListingId(UUID userId, UUID listingId);

    List<SavedListing> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("SELECT s.listingId FROM SavedListing s WHERE s.userId = :userId ORDER BY s.createdAt DESC")
    List<UUID> findListingIdsByUserId(@Param("userId") UUID userId);

    @Modifying
    long deleteByUserIdAndListingId(UUID userId, UUID listingId);
}
