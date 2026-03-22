package com.example.realestate.trust;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data repository for {@link ListingVerificationDimension}.
 *
 * <p>{@code deleteByListingId} is annotated {@code @Transactional} because
 * Spring Data derived-delete methods issue a SELECT then DELETE and require
 * a transaction to be present; callers in the service layer will inherit it,
 * but the annotation here ensures correctness even if called in isolation.
 */
@Repository
public interface ListingVerificationDimensionRepository
        extends JpaRepository<ListingVerificationDimension, UUID> {

    List<ListingVerificationDimension> findAllByListingId(UUID listingId);

    Optional<ListingVerificationDimension> findByListingIdAndDimensionType(
            UUID listingId, String dimensionType);

    boolean existsByListingIdAndDimensionType(UUID listingId, String dimensionType);

    @Transactional
    void deleteByListingId(UUID listingId);
}
