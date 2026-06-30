package com.example.realestate.listing.typed;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Read-only repository for {@link ResidentialUnitDetail}.
 * Used by {@code SearchOutboxPoller} to load the residential detail row when indexing
 * a RESIDENTIAL listing into OpenSearch. No custom methods are required.
 */
@Repository
public interface ResidentialUnitDetailRepository extends JpaRepository<ResidentialUnitDetail, UUID> {
}
