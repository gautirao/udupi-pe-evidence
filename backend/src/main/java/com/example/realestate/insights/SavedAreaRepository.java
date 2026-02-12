package com.example.realestate.insights;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SavedAreaRepository extends JpaRepository<SavedArea, UUID> {

    List<SavedArea> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedArea> findByIdAndUserId(UUID id, UUID userId);
}
