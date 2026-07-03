package com.example.realestate.listing.commercial;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public interface ListingSuitableUseRepository extends JpaRepository<ListingSuitableUse, UUID> {

    List<ListingSuitableUse> findByListingIdOrderByCodeAsc(UUID listingId);

    @Modifying
    @Transactional
    void deleteByListingId(@Param("listingId") UUID listingId);
}
