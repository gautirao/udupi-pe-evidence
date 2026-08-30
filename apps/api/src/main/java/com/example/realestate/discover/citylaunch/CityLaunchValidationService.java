package com.example.realestate.discover.citylaunch;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

/**
 * Admin validation checklist for a {@link CityLaunchRevision} (#1911 PR4, extended #2151 PR A): six
 * independent per-section confirmation flags (landing/regions/areaGroups/areas/listing/
 * agriDestinations) plus an atomic PREPARED -&gt; VALIDATED transition once all six are set.
 *
 * <p><b>Authority split</b>: every write here first fires a guarded
 * {@code @Modifying} query on {@link CityLaunchRevisionRepository} whose SQL {@code WHERE} clause
 * is the single source of truth for "may this row be mutated right now" (id + city_id scoped,
 * {@code superseded_by IS NULL}, {@code lifecycle_status IN (PREPARED, VALIDATED)}, and — for
 * {@code markValidated} — all six columns already true). The Java-level
 * {@link #loadEditableRevision} check below exists ONLY to turn a 0-rows-affected outcome into the
 * right HTTP status (404 missing/wrong-city vs 409 not-editable vs 422 not-all-checked); it is
 * never itself the authority that permits a write to proceed.
 */
@Service
public class CityLaunchValidationService {

    private static final Set<LifecycleStatus> EDITABLE_STATUSES =
            EnumSet.of(LifecycleStatus.PREPARED, LifecycleStatus.VALIDATED);

    private final CityLaunchRevisionRepository revisionRepository;
    private final SandboxAgriDestinationClassificationRepository agriClassificationRepository;

    public CityLaunchValidationService(CityLaunchRevisionRepository revisionRepository,
            SandboxAgriDestinationClassificationRepository agriClassificationRepository) {
        this.revisionRepository = revisionRepository;
        this.agriClassificationRepository = agriClassificationRepository;
    }

    @Transactional(readOnly = true)
    public ValidationStateDto getValidationState(int cityId, long revisionId) {
        CityLaunchRevision revision = findInCity(cityId, revisionId);
        return ValidationStateDto.from(revision, isEditable(revision));
    }

    @Transactional
    public ValidationStateDto toggleCheck(int cityId, long revisionId, String checkKey, boolean value) {
        int rows = switch (checkKey) {
            case "landing" -> value
                    ? revisionRepository.setLandingValidatedTrue(revisionId, cityId)
                    : revisionRepository.setLandingValidatedFalse(revisionId, cityId);
            case "regions" -> value
                    ? revisionRepository.setRegionsValidatedTrue(revisionId, cityId)
                    : revisionRepository.setRegionsValidatedFalse(revisionId, cityId);
            case "areaGroups" -> value
                    ? revisionRepository.setAreaGroupsValidatedTrue(revisionId, cityId)
                    : revisionRepository.setAreaGroupsValidatedFalse(revisionId, cityId);
            case "areas" -> value
                    ? revisionRepository.setAreasValidatedTrue(revisionId, cityId)
                    : revisionRepository.setAreasValidatedFalse(revisionId, cityId);
            case "listing" -> value
                    ? revisionRepository.setListingValidatedTrue(revisionId, cityId)
                    : revisionRepository.setListingValidatedFalse(revisionId, cityId);
            case "agriDestinations" -> value
                    ? revisionRepository.setAgriValidatedTrue(revisionId, cityId)
                    : revisionRepository.setAgriValidatedFalse(revisionId, cityId);
            default -> throw new IllegalArgumentException("Unknown validation check key: " + checkKey);
        };

        if (rows == 0) {
            // Distinguishes 404 (missing/wrong city) from 409 (not editable); if neither applies
            // (a benign race where the row became editable/ineditable between the UPDATE and this
            // read) fall through to a generic conflict rather than silently reporting success.
            loadEditableRevision(cityId, revisionId);
            if ("agriDestinations".equals(checkKey) && value
                    && !agriClassificationRepository.existsByRevisionId(revisionId)) {
                // The revision IS editable, so the EXISTS guard in setAgriValidatedTrue's WHERE
                // clause is what rejected the write (correction pass, #2151 AC2) — not a lifecycle
                // race. Surface the actual business rule rather than the generic 409 below.
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Agri destination classification has zero rows for this revision; "
                                + "agriDestinations cannot be marked validated until Agri generation "
                                + "produces at least one row");
            }
            throw notEditable();
        }
        return getValidationState(cityId, revisionId);
    }

    @Transactional
    public ValidationStateDto reset(int cityId, long revisionId) {
        int rows = revisionRepository.resetValidation(revisionId, cityId);
        if (rows == 0) {
            loadEditableRevision(cityId, revisionId);
            throw notEditable();
        }
        return getValidationState(cityId, revisionId);
    }

    @Transactional
    public ValidationStateDto markValidated(int cityId, long revisionId) {
        int rows = revisionRepository.markValidated(revisionId, cityId, Instant.now());
        if (rows == 0) {
            // Editable but rows==0 means the all-six-checked WHERE clause didn't match — 422, a
            // business-rule failure, not a state-machine conflict. loadEditableRevision throws
            // 404/409 first if either of those applies.
            loadEditableRevision(cityId, revisionId);
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "All six validation checks must be complete before marking this revision validated");
        }
        return getValidationState(cityId, revisionId);
    }

    // ── Guard helpers ────────────────────────────────────────────────────────────────────────

    private CityLaunchRevision loadEditableRevision(int cityId, long revisionId) {
        CityLaunchRevision revision = findInCity(cityId, revisionId);
        if (!isEditable(revision)) {
            throw notEditable();
        }
        return revision;
    }

    private CityLaunchRevision findInCity(int cityId, long revisionId) {
        CityLaunchRevision revision = revisionRepository.findById(revisionId)
                .orElseThrow(CityLaunchValidationService::notFound);
        if (!Objects.equals(revision.getCityId(), Integer.valueOf(cityId))) {
            throw notFound();
        }
        return revision;
    }

    private static boolean isEditable(CityLaunchRevision revision) {
        return revision.getSupersededBy() == null && EDITABLE_STATUSES.contains(revision.getLifecycleStatus());
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "City launch revision not found");
    }

    private static ResponseStatusException notEditable() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "City launch revision is no longer editable");
    }
}
