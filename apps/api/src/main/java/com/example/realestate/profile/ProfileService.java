package com.example.realestate.profile;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

/**
 * Service for profile reads and targeted field updates.
 *
 * <p>Phone validation is NOT performed here — it is the caller's responsibility.
 * All methods use PROPAGATION.REQUIRED (the default) so they participate in the
 * caller's transaction rather than starting their own.
 */
@Service
public class ProfileService {

    private final ProfileRepository profileRepository;

    public ProfileService(ProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
    }

    /**
     * Returns the profile for the given user ID, or empty if not found.
     * Read-only — reuses the caller's transaction if one is active.
     */
    @Transactional(readOnly = true)
    public Optional<Profile> findByUserId(UUID userId) {
        return profileRepository.findByUserId(userId);
    }

    /**
     * Returns the profile for the given user ID or throws 404.
     */
    @Transactional(readOnly = true)
    public Profile findByUserIdOrThrow(UUID userId) {
        return profileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Profile not found"));
    }

    /**
     * Updates the phone field on the profile row identified by {@code userId}.
     *
     * <p>Phone validation is the caller's responsibility — no format checks are
     * performed here.
     *
     * @return {@code true} if the row was found and updated; {@code false} if no
     *         profile row exists for the given user ID.
     */
    @Transactional
    public boolean updatePhone(UUID userId, String phone) {
        Optional<Profile> maybeProfile = profileRepository.findByUserId(userId);
        if (maybeProfile.isEmpty()) {
            return false;
        }
        Profile profile = maybeProfile.get();
        profile.setPhone(phone);
        profileRepository.save(profile);
        return true;
    }
}
