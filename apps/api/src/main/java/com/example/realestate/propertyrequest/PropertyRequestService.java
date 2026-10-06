package com.example.realestate.propertyrequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * Business logic for property requests (#1793). Logging carries IDs / status / counts only: never
 * the phone, ciphertext, hash, client key or request body.
 */
@Service
public class PropertyRequestService {

    private static final Logger log = LoggerFactory.getLogger(PropertyRequestService.class);

    private static final String MASK_FALLBACK = "****";
    private static final int MIN_MASKABLE_DIGITS = 8;

    private final PropertyRequestRepository repository;
    private final PhoneHasher phoneHasher;
    private final PropertyRequestRateLimiter rateLimiter;

    public PropertyRequestService(PropertyRequestRepository repository, PhoneHasher phoneHasher,
                                  PropertyRequestRateLimiter rateLimiter) {
        this.repository = repository;
        this.phoneHasher = phoneHasher;
        this.rateLimiter = rateLimiter;
    }

    @Transactional
    public PropertyRequestCreatedResponse create(CreatePropertyRequestDto dto, String clientKey) {
        rateLimiter.checkClient(clientKey);
        String phoneHash = phoneHasher.hash(dto.phone());
        rateLimiter.checkPhone(phoneHash);

        String canonicalPhone = "+" + PhoneHasher.normalizeDigits(dto.phone());
        // saveAndFlush: the INSERT must run now so Hibernate reads back the DB-generated
        // created_at / retain_until (@Generated) before the response is built.
        PropertyRequest saved = repository.saveAndFlush(new PropertyRequest(
                dto.city().trim(), dto.areaKey(), dto.areaLabel(), dto.journey(), dto.intent(),
                dto.requirement(), dto.budgetMin(), dto.budgetMax(), canonicalPhone, phoneHash,
                dto.contactVia(), dto.consentVersion().trim(), OffsetDateTime.now(ZoneOffset.UTC)));

        log.info("Property request created id={} journey={} status={}",
                saved.getId(), saved.getJourney(), saved.getStatus());
        return new PropertyRequestCreatedResponse(saved.getId(), saved.getStatus(), saved.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public List<AdminPropertyRequestView> listRecent(int limit) {
        List<PropertyRequest> rows = repository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, limit));
        log.info("Property requests listed count={} limit={}", rows.size(), limit);
        return rows.stream().map(PropertyRequestService::toView).toList();
    }

    private static AdminPropertyRequestView toView(PropertyRequest r) {
        return new AdminPropertyRequestView(r.getId(), r.getCity(), r.getAreaKey(), r.getAreaLabel(),
                r.getJourney(), r.getIntent(), r.getRequirement(), r.getBudgetMin(), r.getBudgetMax(),
                mask(r.getPhone()), r.getContactVia(), r.getConsentVersion(), r.getConsentedAt(),
                r.getStatus(), r.getCreatedAt());
    }

    /**
     * Reveals at most the last 4 digits, plus a "+91" prefix only when the canonical number starts
     * with 91; any other prefix is fully masked ("+" and asterisks). Numbers too short to mask
     * meaningfully collapse to "****".
     */
    static String mask(String phone) {
        if (phone == null) {
            return MASK_FALLBACK;
        }
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() < MIN_MASKABLE_DIGITS) {
            return MASK_FALLBACK;
        }
        String prefix = digits.startsWith("91") ? "91" : "";
        int hidden = digits.length() - prefix.length() - 4;
        return "+" + prefix + "*".repeat(hidden) + digits.substring(digits.length() - 4);
    }
}
