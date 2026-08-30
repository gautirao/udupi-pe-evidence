package com.example.realestate.profile;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for the {@code public.profiles} table.
 */
public interface ProfileRepository extends JpaRepository<Profile, UUID> {

    /**
     * Looks up a profile by the Supabase auth user ID.
     */
    Optional<Profile> findByUserId(UUID userId);
}
