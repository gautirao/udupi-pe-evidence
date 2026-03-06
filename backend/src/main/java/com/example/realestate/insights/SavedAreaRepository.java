package com.example.realestate.insights;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SavedAreaRepository extends JpaRepository<SavedArea, UUID> {

    List<SavedArea> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedArea> findByIdAndUserId(UUID id, UUID userId);

    @Query("SELECT DISTINCT s.userId FROM SavedArea s WHERE s.areaKey = :areaKey AND s.alertsEnabled = true")
    List<UUID> findUserIdsByAreaKey(@Param("areaKey") String areaKey);
}
