package com.example.realestate.listing.typed;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Read-only repository for {@link CommercialSpaceDetail}.
 * Used by {@code SearchOutboxPoller} to load the commercial detail row when indexing
 * a COMMERCIAL listing into OpenSearch. No custom methods are required.
 */
@Repository
public interface CommercialSpaceDetailRepository extends JpaRepository<CommercialSpaceDetail, UUID> {
}
