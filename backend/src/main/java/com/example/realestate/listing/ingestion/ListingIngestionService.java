package com.example.realestate.listing.ingestion;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.PromptRegistry;
import com.example.realestate.ai.PropertyType;
import com.example.realestate.discover.AreaResolution;
import com.example.realestate.discover.AreaResolutionService;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.ingestion.RawPostRepository;
import com.example.realestate.listing.area.AreaNormalizer;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.pricing.PriceParser;
import com.example.realestate.quality.QualityRecomputeService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Handles ingestion-path listing creation from raw posts.
 * Extracted from {@link com.example.realestate.listing.ListingService}.
 */
@Service
public class ListingIngestionService {

    private static final Logger log = LoggerFactory.getLogger(ListingIngestionService.class);
    private static final int MIN_CONFIDENCE_FOR_LISTING = 50;
    private static final int MIN_CONFIDENCE_FOR_VALID = 70;

    private final ListingRepository listingRepository;
    private final RawPostRepository rawPostRepository;
    private final GeocodingPort geocodingPort;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final ListingDeduplicationService listingDeduplicationService;
    private final QualityRecomputeService qualityRecomputeService;
    private final AreaResolutionService areaResolutionService;
    private final JdbcOperations jdbcOperations;
    private final Counter areaUnresolvedCounter;

    public ListingIngestionService(
            ListingRepository listingRepository,
            RawPostRepository rawPostRepository,
            GeocodingPort geocodingPort,
            ObjectMapper objectMapper,
            ApplicationEventPublisher applicationEventPublisher,
            ListingDeduplicationService listingDeduplicationService,
            QualityRecomputeService qualityRecomputeService,
            AreaResolutionService areaResolutionService,
            JdbcOperations jdbcOperations,
            MeterRegistry meterRegistry) {
        this.listingRepository = listingRepository;
        this.rawPostRepository = rawPostRepository;
        this.geocodingPort = geocodingPort;
        this.objectMapper = objectMapper;
        this.applicationEventPublisher = applicationEventPublisher;
        this.listingDeduplicationService = listingDeduplicationService;
        this.qualityRecomputeService = qualityRecomputeService;
        this.areaResolutionService = areaResolutionService;
        this.jdbcOperations = jdbcOperations;
        this.areaUnresolvedCounter = Counter.builder("listing.ingestion.area_unresolved")
                .description("Ingested listings whose geocoded area could not be resolved to a canonical area "
                        + "(#1887 PR3) — area_key kept as the raw geocoded value.")
                .register(meterRegistry);
    }

    /**
     * Evaluate a classification result and, if it qualifies, create a listing.
     * Both the listing insert and the raw_post processed update happen in a
     * single transaction — if the listing insert fails, the post is NOT marked
     * as processed (fixing the Edge Function data loss bug).
     *
     * @return the created Listing, or null if the post was discarded
     */
    @Transactional
    public Listing createFrom(RawPost post, ClassificationResult result, String model) {
        // Gate 1: not real estate
        if (!result.isRealEstate()) {
            log.info("Discarded: not real estate postId={} confidence={}",
                    post.getId(), result.confidenceScore());
            rawPostRepository.markProcessed(post.getId());
            return null;
        }

        // Gate 2: confidence below listing threshold
        if (result.confidenceScore() < MIN_CONFIDENCE_FOR_LISTING) {
            log.info("Discarded: confidence below threshold postId={} confidence={} threshold={}",
                    post.getId(), result.confidenceScore(), MIN_CONFIDENCE_FOR_LISTING);
            rawPostRepository.markProcessed(post.getId());
            return null;
        }

        // Gate 3: idempotency — listing already exists for this raw post
        if (listingRepository.existsByRawPostId(post.getId())) {
            log.warn("Discarded: listing already exists for rawPostId={}", post.getId());
            rawPostRepository.markProcessed(post.getId());
            return null;
        }

        // Build and persist listing
        Listing listing = new Listing();
        listing.setRawPostId(post.getId());
        listing.setPropertyType(mapPropertyType(result.propertyType()));
        listing.setPrice(result.price());
        listing.setPricePaise(PriceParser.rupeesToPaise(result.price()));
        listing.setLocality(result.locality());
        listing.setBedrooms(result.bedrooms());
        listing.setLandArea(result.landArea());
        listing.setLandAreaUnit(result.landAreaUnit());

        // Normalize land area and compute price per cent
        AreaNormalizer.NormalizedArea normalizedArea = AreaNormalizer.normalize(
                result.landArea(), result.landAreaUnit());
        listing.setAreaSqm(normalizedArea.areaSqm());
        listing.setAreaSqft(normalizedArea.areaSqft());
        listing.setAreaCent(normalizedArea.areaCent());

        // Compute price per cent if we have both price and area
        Long pricePerCentPaise = AreaNormalizer.computePricePerCentPaise(
                listing.getPricePaise(), normalizedArea.areaCent());
        listing.setPricePerCentPaise(pricePerCentPaise);

        listing.setBuiltArea(result.builtArea());
        listing.setBuiltAreaUnit(result.builtAreaUnit());
        listing.setContactPhone(result.contactPhone());
        listing.setContactInfo(result.contactInfo());
        listing.setDescription(result.description());
        listing.setConfidenceScore(result.confidenceScore());
        listing.setValid(result.confidenceScore() >= MIN_CONFIDENCE_FOR_VALID);
        listing.setParsedData(buildParsedData(result, model));

        // Geocode if locality is present
        if (result.locality() != null && !result.locality().isBlank()) {
            try {
                GeocodingService.GeoResult geoResult = geocodingPort.geocode(result.locality());
                if (geoResult != null) {
                    listing.setLatitude(geoResult.latitude());
                    listing.setLongitude(geoResult.longitude());
                    listing.setAreaKey(computeAreaKey(geoResult));
                    listing.setAreaLabel(computeAreaLabel(geoResult));
                    log.debug("Geocoded locality={} to lat={} lng={} areaKey={} areaLabel={}",
                            result.locality(), geoResult.latitude(), geoResult.longitude(),
                            listing.getAreaKey(), listing.getAreaLabel());

                    // #1887 PR3: resolve the geocoded area against canonical areas/area_alias
                    // before persisting. RawPost ingestion has no provider/external-source-id
                    // concept (organic scraped posts, not a curated onboarding batch) — the
                    // PROVIDER_ID resolution step is therefore always a no-op here (both args
                    // null) and resolution falls through to CANONICAL_KEY then ALIAS.
                    applyAreaResolution(listing, geoResult, result.locality());
                } else {
                    log.debug("Geocoding returned null for locality={}", result.locality());
                }
            } catch (Exception e) {
                log.warn("Geocoding failed for locality={}: {}", result.locality(), e.getMessage());
                // Leave lat/lng/areaKey/areaLabel null - listing still created
            }
        }

        // Compute dedupe hash and check for duplicates / repost count
        String dedupeHash = listingDeduplicationService.computeDedupeHash(
                result.description(), result.locality(), result.price());
        listing.setDedupeHash(dedupeHash);

        if (dedupeHash != null && listingRepository.existsByDedupeHash(dedupeHash)) {
            listing.setDuplicate(true);
            long priorCount = listingRepository.countByDedupeHash(dedupeHash);
            listing.setRepostCount((int) priorCount);
            log.info("Duplicate detected: hash={} repostCount={} description={} locality={} price={}",
                    dedupeHash, priorCount, result.description(), result.locality(), result.price());
        }

        Listing saved = listingRepository.save(listing);

        // Mark raw post as processed — same transaction as the listing insert
        rawPostRepository.markProcessed(post.getId());

        log.info("Created listing listingId={} rawPostId={} propertyType={} confidence={} isValid={} isDuplicate={}",
                saved.getId(), post.getId(), saved.getPropertyType(),
                saved.getConfidenceScore(), saved.isValid(), saved.isDuplicate());

        // Trigger quality recompute after the ingestion transaction commits
        qualityRecomputeService.recomputeAfterCommit(saved.getId());
        return saved;
    }

    /**
     * Maps AI PropertyType enum to the DB VARCHAR values accepted by the property_type
     * CHECK constraint (V61). Valid values: 'land', 'house', 'commercial',
     * 'commercial_building', 'warehouse', 'commercial_land', 'apartment', 'other'.
     * The AI can return APARTMENT which we map to 'house' for display grouping.
     * Legacy COMMERCIAL (from v1 prompts or cached AI responses) maps to 'commercial_building'
     * to match the V56 migration default.
     */
    private String mapPropertyType(PropertyType propertyType) {
        if (propertyType == null) {
            return "other";
        }
        return switch (propertyType) {
            case HOUSE -> "house";
            case APARTMENT -> "house"; // AI maps APARTMENT -> "house" for display grouping; 'apartment' is a valid DB value (per CHECK constraint) but not used by the ingestion path.
            case LAND -> "land";
            case COMMERCIAL -> "commercial_building"; // legacy v1 fallback; V56 migrated rows to commercial_building
            case COMMERCIAL_BUILDING -> "commercial_building";
            case WAREHOUSE -> "warehouse";
            case COMMERCIAL_LAND -> "commercial_land";
            case OTHER -> "other";
            case AGRICULTURAL_LAND -> "agricultural_land";
            // M38-13A (#1626): the AI classifier does not emit these yet (broker-only create
            // flow), but the switch must stay exhaustive against the PropertyType enum.
            case VILLA -> "villa";
            case RESIDENTIAL_PLOT -> "residential_plot";
        };
    }

    private String buildParsedData(ClassificationResult result, String model) {
        try {
            ObjectNode node = objectMapper.valueToTree(result);
            node.put("model", model);
            node.put("prompt_version", PromptRegistry.PROMPT_VERSION);
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize parsed_data, storing empty object", e);
            return "{}";
        }
    }

    /**
     * Resolves {@code listing}'s geocoded area against canonical areas/area_alias (#1887 PR3) and
     * stamps {@code areaResolutionStatus}/{@code areaResolutionMethod} accordingly. On RESOLVED,
     * overwrites {@code areaKey} with the canonical key (areaLabel is left as the human-readable
     * geocode-derived display value). On UNRESOLVED, keeps the geocoded areaKey, emits a
     * structured WARN, and increments {@link #areaUnresolvedCounter}. Never throws — a city that
     * cannot be resolved to an id cannot be scoped for ALIAS lookup, so resolution is skipped and
     * the listing is stamped UNRESOLVED (same terminal state as an exhausted PROVIDER_ID/
     * CANONICAL_KEY/ALIAS search) rather than silently defaulting to the entity's RESOLVED default
     * — the geocoded area_key is still kept as-is.
     */
    private void applyAreaResolution(Listing listing, GeocodingService.GeoResult geoResult, String locality) {
        Integer cityId = resolveCityId(geoResult);
        if (cityId == null) {
            listing.setAreaResolutionStatus("UNRESOLVED");
            listing.setAreaResolutionMethod(null);
            areaUnresolvedCounter.increment();
            log.warn("AreaResolution: UNRESOLVED (no cities row for geocoded city) city={} "
                    + "geocodedAreaKey={} locality={}", geoResult.city(), listing.getAreaKey(), locality);
            return;
        }

        AreaResolution resolution = areaResolutionService.resolve(
                cityId, /* provider */ null, /* externalSourceId */ null, listing.getAreaKey(), locality);

        if (resolution.isResolved()) {
            listing.setAreaKey(resolution.canonicalAreaKey());
            listing.setAreaResolutionStatus("RESOLVED");
            listing.setAreaResolutionMethod(resolution.method().name());
        } else {
            listing.setAreaResolutionStatus("UNRESOLVED");
            listing.setAreaResolutionMethod(null);
            areaUnresolvedCounter.increment();
            log.warn("AreaResolution: UNRESOLVED cityId={} geocodedAreaKey={} locality={}",
                    cityId, listing.getAreaKey(), locality);
        }
    }

    /**
     * Derives the listing's {@code cities.id} from the geocoded city name, for scoping the ALIAS
     * resolution step. {@code cities.slug} (V71) uses the APP-CITY vocabulary — {@code bangalore},
     * {@code mangalore}, {@code udupi}, {@code kundapur} — which is a DIFFERENT vocabulary from
     * the ADMINISTRATIVE DISTRICT segment normalised by {@code AreaKeyFormat
     * .normaliseDistrictToken} (e.g. Kundapur's areas carry district {@code "Udupi"} but city
     * slug {@code "kundapur"} — see V71's header comment). {@link #normalizeCityToSlug} is
     * therefore an INDEPENDENT, smaller alias set mapping common geocoded-city-name variants to
     * the actual {@code cities.slug} values, not a reuse of the district-normalisation rules.
     *
     * @return the matching {@code cities.id}, or null if no city row matches.
     */
    private Integer resolveCityId(GeocodingService.GeoResult geoResult) {
        if (geoResult == null || geoResult.city() == null || geoResult.city().isBlank()) {
            return null;
        }
        String citySlug = normalizeCityToSlug(geoResult.city());
        return jdbcOperations.query(
                "SELECT id FROM cities WHERE slug = ?",
                rs -> rs.next() ? rs.getInt("id") : null,
                citySlug);
    }

    /** See {@link #resolveCityId}'s javadoc for why this is a distinct alias set. */
    private static String normalizeCityToSlug(String rawCity) {
        String normalised = rawCity.trim().toLowerCase().replaceAll("\\s+", "-").replaceAll("[^a-z0-9\\-]", "");
        return switch (normalised) {
            case "bengaluru", "bengaluru-urban" -> "bangalore";
            case "mangaluru", "dakshina-kannada" -> "mangalore";
            case "kundapura" -> "kundapur";
            default -> normalised;
        };
    }

    /**
     * Compute a deterministic area_key from geocode result components.
     * Format: country|region|city|locality (lowercase, trimmed, spaces->-, punctuation removed)
     * Fallback: if locality is null, use neighborhood; if neighborhood is null, use city.
     *
     * @return normalized area_key, or null if insufficient components
     */
    public String computeAreaKey(GeocodingService.GeoResult geoResult) {
        if (geoResult == null) {
            return null;
        }

        String country = normalizeAreaComponent(geoResult.country());
        String region = normalizeAreaComponent(geoResult.region());
        String city = normalizeAreaComponent(geoResult.city());

        // Locality fallback chain: locality -> neighborhood -> city
        String locality = normalizeAreaComponent(geoResult.locality());
        if (locality.isEmpty()) {
            locality = normalizeAreaComponent(geoResult.neighborhood());
        }
        if (locality.isEmpty()) {
            locality = city; // final fallback to city
        }

        // Require at least country and city for a meaningful area_key
        if (country.isEmpty() || city.isEmpty()) {
            return null;
        }

        return String.join("|", country, region, city, locality);
    }

    /**
     * Compute a human-readable area label for display.
     * Format: "Locality, City" or just "City" if locality not available.
     *
     * @return display label, or null if no city available
     */
    public String computeAreaLabel(GeocodingService.GeoResult geoResult) {
        if (geoResult == null) {
            return null;
        }

        String city = geoResult.city();
        if (city == null || city.isBlank()) {
            return null;
        }

        // Locality fallback chain: locality -> neighborhood -> null
        String locality = geoResult.locality();
        if (locality == null || locality.isBlank()) {
            locality = geoResult.neighborhood();
        }

        if (locality != null && !locality.isBlank()) {
            return locality.trim() + ", " + city.trim();
        }
        return city.trim();
    }

    /**
     * Normalize a single area component for use in area_key:
     * - lowercase
     * - trim whitespace
     * - replace spaces with hyphens
     * - remove punctuation (keep only alphanumeric and hyphens)
     */
    private String normalizeAreaComponent(String value) {
        if (value == null) {
            return "";
        }
        return value.trim()
                .toLowerCase()
                .replaceAll("\\s+", "-")
                .replaceAll("[^a-z0-9\\-]", "");
    }
}
