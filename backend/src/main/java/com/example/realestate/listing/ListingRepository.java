package com.example.realestate.listing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ListingRepository extends JpaRepository<Listing, UUID> {

    boolean existsByRawPostId(UUID rawPostId);

    boolean existsByDedupeHash(String dedupeHash);
}
