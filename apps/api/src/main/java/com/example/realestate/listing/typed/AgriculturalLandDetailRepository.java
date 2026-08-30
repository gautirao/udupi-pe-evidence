package com.example.realestate.listing.typed;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Read-only repository for {@link AgriculturalLandDetail}.
 * Used by {@code SearchOutboxPoller} to load the agricultural detail row when indexing
 * an AGRICULTURAL listing into OpenSearch. No custom methods are required.
 */
@Repository
public interface AgriculturalLandDetailRepository extends JpaRepository<AgriculturalLandDetail, UUID> {
}
