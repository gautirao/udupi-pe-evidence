package com.example.realestate.trust;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PhotoBlocklistRepository extends JpaRepository<PhotoBlocklistEntry, UUID> {
    // Inherits findAll() — blocklist is expected to be small (< 10k entries)
}
