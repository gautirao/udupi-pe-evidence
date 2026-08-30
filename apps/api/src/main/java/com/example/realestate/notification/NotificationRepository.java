package com.example.realestate.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByUserId(UUID userId, Pageable pageable);

    long countByUserIdAndIsReadFalse(UUID userId);

    Optional<Notification> findByIdAndUserId(UUID id, UUID userId);

    @Modifying(clearAutomatically = true)
    @Query(value = "INSERT INTO public.notifications (user_id, type, title, message, metadata) " +
            "VALUES (:userId, :type, :title, :message, CAST(:metadata AS jsonb))",
            nativeQuery = true)
    void insertNotification(@Param("userId") UUID userId,
                            @Param("type") String type,
                            @Param("title") String title,
                            @Param("message") String message,
                            @Param("metadata") String metadata);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.userId = :userId AND n.isRead = false")
    int markAllAsReadByUserId(@Param("userId") UUID userId);
}
