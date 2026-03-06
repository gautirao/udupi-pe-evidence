package com.example.realestate.insights;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SavedAreaRepository extends JpaRepository<SavedArea, UUID> {

    List<SavedArea> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedArea> findByIdAndUserId(UUID id, UUID userId);

    @Query("SELECT DISTINCT s.userId FROM SavedArea s WHERE s.areaKey = :areaKey AND s.alertsEnabled = true")
    List<UUID> findUserIdsByAreaKey(@Param("areaKey") String areaKey);

    @Query(value = """
            SELECT DISTINCT p.email
            FROM user_saved_areas s
            JOIN public.profiles p ON p.user_id = s.user_id
            WHERE s.area_key = :areaKey AND s.alerts_enabled = true AND p.email IS NOT NULL
            """, nativeQuery = true)
    List<String> findUserEmailsByAreaKey(@Param("areaKey") String areaKey);

    List<SavedArea> findByAreaKeyAndAlertsEnabledTrue(String areaKey);

    @Query(value = """
            SELECT p.email
            FROM public.profiles p
            WHERE p.user_id IN :userIds AND p.email IS NOT NULL
            """, nativeQuery = true)
    List<String> findEmailsByUserIds(@Param("userIds") Collection<UUID> userIds);
}
