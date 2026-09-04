package com.example.realestate.savedsearch;

import com.example.realestate.discover.PolygonGeographicSafetyPolicy;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * #2019 Slice A: business logic for saved/alertable searches. Owns the validation
 * pipeline (scope exclusivity, per-scope-kind serialization checks, filter allowlist),
 * the normalized fingerprint / idempotent-create semantics, the per-user max-active-alert
 * cap, and IDOR-safe owner-scoped CRUD + pause/resume.
 *
 * <p>Rate-limit *consumption* (the {@code tryConsume} check) is deliberately NOT done
 * here — it lives at the controller layer, matching this codebase's established
 * convention ({@code BookingController}, {@code PaymentController}), which lets the
 * controller reject over-limit requests before this service (and the DB) are touched.
 *
 * <p>This slice never transitions a row's {@code alertStatus} out of {@link
 * AlertStatus#IDLE} and never performs matching/delivery — that is Slice B.
 */
@Service
public class SavedSearchService {

    private static final Logger log = LoggerFactory.getLogger(SavedSearchService.class);

    /**
     * Conservative default cap on ACTIVE saved searches per user. Owner decision taken
     * (reversible) for #2019 Slice A in the absence of a specified product value — see the
     * PR body's "Owner decisions taken (reversible)" section.
     */
    static final int MAX_ACTIVE_SAVED_SEARCHES = 25;

    private static final int MAX_LABEL_LENGTH = 120;

    private final SavedSearchRepository savedSearchRepository;
    private final PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;
    private final SavedSearchInserter savedSearchInserter;

    public SavedSearchService(
            SavedSearchRepository savedSearchRepository,
            PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy,
            SavedSearchInserter savedSearchInserter) {
        this.savedSearchRepository = savedSearchRepository;
        this.polygonGeographicSafetyPolicy = polygonGeographicSafetyPolicy;
        this.savedSearchInserter = savedSearchInserter;
    }

    /** Result of a create call: whether a new row was created or an equivalent one already existed. */
    public record CreateOutcome(SavedSearch savedSearch, boolean created) {
    }

    @Transactional
    public CreateOutcome create(
            UUID userId,
            String citySlug,
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> rawFilters,
            String label,
            AlertFrequency alertFrequency) {
        String normalizedCitySlug = requireCitySlug(citySlug);
        String normalizedLabel = validateLabel(label);
        AlertFrequency normalizedAlertFrequency = alertFrequency == null ? AlertFrequency.DAILY : alertFrequency;

        Map<String, Object> filters =
                validateScopeAndFilters(
                        resultScopeKind,
                        normalizedCitySlug,
                        areaKeys,
                        polygon,
                        viewportSouth,
                        viewportWest,
                        viewportNorth,
                        viewportEast,
                        rawFilters);

        String fingerprint =
                SavedSearchFingerprint.compute(
                        normalizedCitySlug,
                        resultScopeKind,
                        areaKeys,
                        polygon,
                        viewportSouth,
                        viewportWest,
                        viewportNorth,
                        viewportEast,
                        filters);

        var existing = savedSearchRepository.findByUserIdAndFingerprint(userId, fingerprint);
        if (existing.isPresent()) {
            log.info("Saved search create is idempotent no-op: user={} fingerprint matches existing row", userId);
            return new CreateOutcome(existing.get(), false);
        }

        long activeCount = savedSearchRepository.countByUserIdAndStatus(userId, SavedSearchStatus.ACTIVE);
        if (activeCount >= MAX_ACTIVE_SAVED_SEARCHES) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "saved_search_max_active_limit_reached");
        }

        OffsetDateTime now = OffsetDateTime.now();
        SavedSearch savedSearch =
                new SavedSearch(
                        UUID.randomUUID(),
                        userId,
                        normalizedCitySlug,
                        resultScopeKind,
                        resultScopeKind == ResultScopeKind.AREA_SET ? areaKeys : null,
                        resultScopeKind == ResultScopeKind.POLYGON ? polygon : null,
                        resultScopeKind == ResultScopeKind.VIEWPORT ? viewportSouth : null,
                        resultScopeKind == ResultScopeKind.VIEWPORT ? viewportWest : null,
                        resultScopeKind == ResultScopeKind.VIEWPORT ? viewportNorth : null,
                        resultScopeKind == ResultScopeKind.VIEWPORT ? viewportEast : null,
                        filters,
                        fingerprint,
                        normalizedLabel,
                        SavedSearchStatus.ACTIVE,
                        normalizedAlertFrequency,
                        AlertStatus.IDLE,
                        now,
                        now);

        try {
            // REQUIRES_NEW + saveAndFlush (see SavedSearchInserter): the unique-index check
            // runs NOW, inside a transaction of its own, so a collision is caught here rather
            // than deferred to this method's commit, and this (outer) transaction stays usable
            // for the recovery lookup below instead of being marked rollback-only.
            SavedSearch saved = savedSearchInserter.insert(savedSearch);
            return new CreateOutcome(saved, true);
        } catch (DataIntegrityViolationException e) {
            // Race: a concurrent request created an equivalent search between our lookup and
            // insert. Treat identically to the found-existing path above (idempotent): the
            // winner's row is already committed, so a READ COMMITTED lookup sees it.
            log.info("Saved search create raced with a concurrent insert for user={}; returning existing row", userId);
            return savedSearchRepository
                    .findByUserIdAndFingerprint(userId, fingerprint)
                    .map(row -> new CreateOutcome(row, false))
                    .orElseThrow(() -> e);
        }
    }

    @Transactional
    public SavedSearch update(
            UUID userId,
            UUID id,
            String citySlug,
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> rawFilters,
            String label,
            AlertFrequency alertFrequency) {
        SavedSearch savedSearch = findOwnedOrThrow(userId, id);

        String normalizedCitySlug = requireCitySlug(citySlug);
        String normalizedLabel = validateLabel(label);
        AlertFrequency normalizedAlertFrequency = alertFrequency == null ? AlertFrequency.DAILY : alertFrequency;

        Map<String, Object> filters =
                validateScopeAndFilters(
                        resultScopeKind,
                        normalizedCitySlug,
                        areaKeys,
                        polygon,
                        viewportSouth,
                        viewportWest,
                        viewportNorth,
                        viewportEast,
                        rawFilters);

        String fingerprint =
                SavedSearchFingerprint.compute(
                        normalizedCitySlug,
                        resultScopeKind,
                        areaKeys,
                        polygon,
                        viewportSouth,
                        viewportWest,
                        viewportNorth,
                        viewportEast,
                        filters);

        savedSearch.applyUpdate(
                normalizedCitySlug,
                resultScopeKind,
                resultScopeKind == ResultScopeKind.AREA_SET ? areaKeys : null,
                resultScopeKind == ResultScopeKind.POLYGON ? polygon : null,
                resultScopeKind == ResultScopeKind.VIEWPORT ? viewportSouth : null,
                resultScopeKind == ResultScopeKind.VIEWPORT ? viewportWest : null,
                resultScopeKind == ResultScopeKind.VIEWPORT ? viewportNorth : null,
                resultScopeKind == ResultScopeKind.VIEWPORT ? viewportEast : null,
                filters,
                fingerprint,
                normalizedLabel,
                normalizedAlertFrequency,
                OffsetDateTime.now());

        try {
            // saveAndFlush (not save): `savedSearch` is already a managed entity fetched via
            // findOwnedOrThrow above, so a plain save() is a no-op merge that defers the actual
            // UPDATE (and therefore the unique-index check) until the enclosing @Transactional
            // proxy commits — which happens AFTER this method returns, outside this try/catch.
            // Without the explicit flush, a fingerprint-collision constraint violation would
            // propagate untranslated from the transaction commit instead of being caught here,
            // so the caller would see a raw/untranslated failure instead of the documented 409
            // saved_search_duplicate_fingerprint.
            return savedSearchRepository.saveAndFlush(savedSearch);
        } catch (DataIntegrityViolationException e) {
            // The updated fingerprint collides with a different saved search this user already
            // owns (the (user_id, fingerprint) unique index). Surface as a conflict rather than
            // a generic 500 — the caller already has an equivalent saved search under another id.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "saved_search_duplicate_fingerprint", e);
        }
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        SavedSearch savedSearch = findOwnedOrThrow(userId, id);
        savedSearchRepository.delete(savedSearch);
    }

    @Transactional
    public SavedSearch pause(UUID userId, UUID id) {
        SavedSearch savedSearch = findOwnedOrThrow(userId, id);
        savedSearch.setStatus(SavedSearchStatus.PAUSED, OffsetDateTime.now());
        return savedSearchRepository.save(savedSearch);
    }

    @Transactional
    public SavedSearch resume(UUID userId, UUID id) {
        SavedSearch savedSearch = findOwnedOrThrow(userId, id);
        if (savedSearch.getStatus() != SavedSearchStatus.ACTIVE) {
            long activeCount = savedSearchRepository.countByUserIdAndStatus(userId, SavedSearchStatus.ACTIVE);
            if (activeCount >= MAX_ACTIVE_SAVED_SEARCHES) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "saved_search_max_active_limit_reached");
            }
        }
        savedSearch.setStatus(SavedSearchStatus.ACTIVE, OffsetDateTime.now());
        return savedSearchRepository.save(savedSearch);
    }

    @Transactional(readOnly = true)
    public List<SavedSearch> list(UUID userId) {
        return savedSearchRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public SavedSearch get(UUID userId, UUID id) {
        return findOwnedOrThrow(userId, id);
    }

    private SavedSearch findOwnedOrThrow(UUID userId, UUID id) {
        // IDOR-safe: 404 (never 403) on ownership mismatch or absence, so existence is never
        // leaked to a caller who doesn't own the row. Mirrors SavedAreaController's pattern.
        return savedSearchRepository
                .findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "saved_search_not_found"));
    }

    private Map<String, Object> validateScopeAndFilters(
            ResultScopeKind resultScopeKind,
            String citySlug,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> rawFilters) {
        SavedSearchScopeExclusivity.check(
                resultScopeKind, areaKeys, polygon, viewportSouth, viewportWest, viewportNorth, viewportEast);

        if (resultScopeKind == ResultScopeKind.POLYGON) {
            polygonGeographicSafetyPolicy.validate(citySlug, polygon);
        } else if (resultScopeKind == ResultScopeKind.VIEWPORT) {
            SavedSearchViewportValidator.validate(viewportSouth, viewportWest, viewportNorth, viewportEast);
        }

        return SavedSearchFilterAllowlist.validate(rawFilters);
    }

    private static String requireCitySlug(String citySlug) {
        if (citySlug == null || citySlug.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "saved_search_city_slug_required");
        }
        return citySlug;
    }

    private static String validateLabel(String label) {
        if (label == null) {
            return null;
        }
        String trimmed = label.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > MAX_LABEL_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "saved_search_label_too_long");
        }
        // Labels are user-supplied free text stored verbatim in a JSONB-free VARCHAR column
        // and only ever returned as JSON string data (never interpolated into HTML, SQL, or a
        // shell/command context), so no further sanitization is required here.
        return trimmed;
    }
}
