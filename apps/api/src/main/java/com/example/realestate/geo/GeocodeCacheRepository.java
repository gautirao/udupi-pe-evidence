package com.example.realestate.geo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GeocodeCacheRepository extends JpaRepository<GeocodeCache, UUID> {

    Optional<GeocodeCache> findByLocalityIgnoreCase(String locality);
}
