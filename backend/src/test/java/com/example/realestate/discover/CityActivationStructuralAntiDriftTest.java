package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Structural fail-closed anti-drift test for #1935 (city {@code is_active} gating).
 *
 * <p><b>What this proves.</b> Every enumerated production file that reads a city-scoped table
 * (see {@link #TABLE_PATTERN}) is scanned for every SQL string literal it contains. A literal
 * that references a city-scoped table must satisfy ONE of:
 * <ol>
 *   <li>(a) the literal itself contains {@code is_active} (inline gate on the {@code cities}
 *       join), or</li>
 *   <li>(b) the enclosing METHOD (not just the file — see {@link #findEnclosingMethod}) calls
 *       {@code cityActivationGuard.isActive...(} before/within the same method body, or</li>
 *   <li>(c) an explicit, individually-justified entry in {@link #ALLOWLIST} keyed by
 *       {@code ClassName#literal-fragment}.</li>
 * </ol>
 * A query satisfying none of these FAILS the test — this is the fail-closed default a future
 * 15th ungated query trips automatically, without anyone having to remember to update this file.
 *
 * <p><b>Scope.</b> This test scans the PUBLIC discover/trends/public-listing read surface (the
 * service/repository classes backing the endpoints enumerated in #1935's response-contract
 * checklist), not the entire {@code discover}/{@code area}/{@code listing}/{@code intelligence}
 * package tree. Admin onboarding/backfill/city-launch/ingestion classes (e.g.
 * {@code AreaOnboardingApplyService}, {@code CityLaunchPromotionService},
 * {@code ListingIngestionService}, {@code AreaResolutionService}) legitimately read/write
 * {@code cities}/{@code areas} regardless of {@code is_active} — that is their job (e.g.
 * activating a city, curating areas before a city ever launches) — and are a DIFFERENT security
 * surface from "can an anonymous caller learn an inactive city exists via a public read
 * endpoint". Restricting scope to {@link #SCAN_FILES} keeps the allowlist meaningful (a code
 * reviewer can audit every entry) instead of drowning it in admin-tooling noise.
 *
 * <p><b>Resolved finding (previously RED, now fixed and GREEN).</b> Writing this scanner
 * originally caught a real, previously-undetected gap: {@code DiscoverSummaryService}'s
 * {@code queryAreaGroupRegions} (no {@code c.is_active} check on its {@code cities} join) and
 * {@code queryCorridorRegions} (no city-activation check at all against
 * {@code regional_area_classifications.city_key}) let an inactive city's region_key/region_label
 * leak via {@code GET /api/discover/summary}. The backend-engineer has since gated both:
 * {@code queryAreaGroupRegions} now has an inline {@code AND c.is_active = true} on the existing
 * {@code cities} join (Pattern B), and {@code queryCorridorRegions} now short-circuits to
 * {@code List.of()} via {@code cityActivationGuard.isActiveCitySlug(city)} before touching
 * {@code regional_area_classifications} (Pattern C) — mirroring
 * {@link RegionalAreaGroupsService#getRegionalGroups}'s existing guard pattern. Both are now
 * covered by this scanner ({@code queryCorridorRegions} via rule (b) automatically;
 * {@code queryAreaGroupRegions} via a narrow {@link #ALLOWLIST} entry documenting why its inline
 * {@code is_active} clause sits in a second text-block literal invisible to this scanner's
 * per-literal matching — see that entry). Behavioural proof lives in
 * {@code CityActiveGating1935IT.discoverSummaryAreaGroupRegions_inactiveEqualsUnknownParity_activeNoRegression()}
 * and the corresponding corridor-path test.
 */
class CityActivationStructuralAntiDriftTest {

    /** City-scoped tables whose presence in a SQL literal makes it a "candidate" query. */
    private static final Pattern TABLE_PATTERN = Pattern.compile(
            "\\b(cities|areas|area_overview_stats|regional_area_classifications)\\b");

    private static final Pattern SQL_KEYWORD_PATTERN = Pattern.compile(
            "\\b(SELECT|INSERT|UPDATE|DELETE)\\b", Pattern.CASE_INSENSITIVE);

    /** Java text-block literal: {@code """ ... """}. */
    private static final Pattern TEXT_BLOCK_PATTERN = Pattern.compile("\"\"\"(.*?)\"\"\"", Pattern.DOTALL);

    /** Ordinary double-quoted string literal (no embedded unescaped quote). */
    private static final Pattern STRING_LITERAL_PATTERN = Pattern.compile("\"(?:[^\"\\\\]|\\\\.)*\"");

    private static final Pattern GUARD_CALL_PATTERN = Pattern.compile("cityActivationGuard\\.isActive\\w*\\(");

    /**
     * Crude method-boundary matcher: a modifier/return-type line ending in
     * {@code someName(...) {} on ...} followed by a brace-balanced body. Good enough for this
     * repo's consistently-formatted service classes (4-space indent, no anonymous inner classes
     * with the same signature shape at top level).
     */
    private static final Pattern METHOD_START_PATTERN = Pattern.compile(
            "(?m)^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s*)*" // annotations
                    + "(?:public|private|protected)\\s+[\\w<>\\[\\],.? ]+?\\s+(\\w+)\\s*\\([^;{]*\\)\\s*\\{");

    /** Repo-relative path from the module root (backend/) to src/main/java. */
    private static final String SRC_MAIN_JAVA = "src/main/java/";

    /**
     * Files in scope — the service/repository classes that back the public Discover/trends/
     * public-listing read endpoints enumerated in #1935's response-contract checklist, plus the
     * shared predicate builder and the guard itself (both must obviously stay in scope so a
     * future edit to either is also caught).
     */
    private static final List<String> SCAN_FILES = List.of(
            "com/example/realestate/discover/DiscoverListingPredicateBuilder.java",
            "com/example/realestate/discover/CityActivationGuard.java",
            "com/example/realestate/discover/DiscoverListingsService.java",
            "com/example/realestate/discover/DiscoverMarkersService.java",
            "com/example/realestate/discover/PublicSchoolRadiusListingsService.java",
            "com/example/realestate/discover/AreaGroupsService.java",
            "com/example/realestate/discover/AreaSummaryService.java",
            "com/example/realestate/discover/CityAreaListingsService.java",
            "com/example/realestate/discover/DiscoverAgriMapListingsService.java",
            "com/example/realestate/discover/RegionSummaryService.java",
            "com/example/realestate/discover/RegionalAreaGroupsService.java",
            "com/example/realestate/discover/DiscoverSummaryService.java",
            "com/example/realestate/area/AreaOverviewService.java",
            "com/example/realestate/intelligence/BuyerAreaIntelligenceService.java",
            "com/example/realestate/listing/core/ListingRepository.java",
            "com/example/realestate/listing/api/PublicListingController.java"
    );

    /**
     * Explicit, individually-justified exemptions. Each entry is a (file, literal-fragment,
     * justification) triple. The literal-fragment must be a short, near-unique substring of the
     * offending SQL literal so a future edit that changes the query's SHAPE (not just whitespace)
     * stops matching and the test starts flagging it again — a deliberately narrow match, not a
     * blanket per-file/per-method pass.
     */
    private static final List<Allowance> ALLOWLIST = List.of(
            new Allowance(
                    "com/example/realestate/discover/CityActivationGuard.java",
                    "SELECT EXISTS (SELECT 1 FROM areas a JOIN cities c ON c.id = a.city_id ",
                    "isActiveForAreaKey()'s canonical join query (PR review fix, #1935 — replaced the "
                            + "old district-segment string-split heuristic) is built via TWO adjacent "
                            + "string-literal concatenation: \"SELECT EXISTS (SELECT 1 FROM areas a JOIN "
                            + "cities c ON c.id = a.city_id \" + \"WHERE a.area_key = ? AND c.is_active = "
                            + "true)\" — this scanner matches each literal independently, so it sees only "
                            + "the first half (no is_active) and misses the is_active clause in the "
                            + "concatenated second half, which also contains no SQL keyword (SELECT/"
                            + "INSERT/UPDATE/DELETE) so it is never even considered a candidate on its "
                            + "own. Same scanner blind spot as the BuyerAreaIntelligenceService.resolveArea "
                            + "entry below. Verified inline gated by reading the actual concatenated "
                            + "source; behavioural proof in "
                            + "CityActiveGating1935IT.guardIsActiveForAreaKey_canonicalJoin_notStringHeuristic()."),
            new Allowance(
                    "com/example/realestate/discover/CityAreaListingsService.java",
                    "JOIN cities c ON c.id = a.city_id",
                    "getAreaListings()'s per-listing query (this literal) runs only AFTER the method's "
                            + "own upfront guard a few lines above: 'SELECT COUNT(*) FROM cities WHERE "
                            + "slug = ? AND is_active = true' — a DIFFERENT string literal in the SAME "
                            + "method, not visible to this scanner's per-literal matching — which throws "
                            + "400 unknown_city (inactive treated identically to unknown) before this query "
                            + "is ever built or executed."),
            new Allowance(
                    "com/example/realestate/discover/RegionSummaryService.java",
                    "SELECT cr.region_key AS region_key, cr.display_label AS display_label",
                    "getRegions(citySlug, listingPurpose)'s big region query runs only when cityId is "
                            + "non-null, and cityId comes from the method's own upfront query 'SELECT id "
                            + "FROM cities WHERE slug = ? AND is_active = true' (a DIFFERENT literal a few "
                            + "lines above in the same method) — an inactive/unknown city returns null "
                            + "there and getRegions short-circuits to an empty RegionSummaryResponse before "
                            + "this literal's query ever runs."),
            new Allowance(
                    "com/example/realestate/discover/DiscoverSummaryService.java",
                    "FROM area_groups ag\n                JOIN cities c ON c.id = ag.city_id",
                    "queryAreaGroupRegions() builds its query via TWO separate text-block literals "
                            + "joined by consecutive StringBuilder.append() calls in the same method: the "
                            + "first (this literal, matched here — 'FROM area_groups ag JOIN cities c ...') "
                            + "has no is_active, but the SECOND, immediately-following text block appended "
                            + "a few lines later is 'WHERE c.slug = ? AND c.is_active = true AND "
                            + "ag.is_active = true ...' — this scanner matches each text-block literal "
                            + "independently and the second block contains no SQL keyword (SELECT/INSERT/"
                            + "UPDATE/DELETE) so it is never even considered a candidate, hiding the "
                            + "inline is_active gate from this scanner. Verified gated by reading the "
                            + "concatenated source (#1935 fix, ratified — c.is_active = true added "
                            + "2026-07-17)."),
            new Allowance(
                    "com/example/realestate/discover/RegionalAreaGroupsService.java",
                    "rd.sort_order AS direction_sort_order,",
                    "REGIONAL_GROUPS_SQL is a class-level constant (declared outside any method, hence "
                            + "this scanner's method-range attribution reports '<static field / unknown "
                            + "method>') consumed at exactly ONE call site: inside getRegionalGroups(city, "
                            + "propertyType), which calls cityActivationGuard.isActiveCitySlug(normalizedCity) "
                            + "and returns an empty response BEFORE this query executes — confirmed by "
                            + "reading the single jdbcOperations.query(REGIONAL_GROUPS_SQL, ...) call site."),
            new Allowance(
                    "com/example/realestate/area/AreaOverviewService.java",
                    "SELECT area_key, area_level, listing_count_90d,",
                    "queryAreaRow(areaKey) is a private helper with exactly two call sites, BOTH inside "
                            + "assembleResponse(areaKey) and BOTH after "
                            + "cityActivationGuard.isActiveForAreaKey(areaKey) has already thrown/returned: "
                            + "the primary areaKey lookup, and the districtKey fallback lookup (districtKey "
                            + "is derived FROM that same already-gated row, so it is the same city by "
                            + "construction)."),
            new Allowance(
                    "com/example/realestate/intelligence/BuyerAreaIntelligenceService.java",
                    "SELECT a.area_key, a.name FROM areas a JOIN cities c ON c.id = a.city_id",
                    "resolveArea()'s query is built via Java string concatenation split across TWO "
                            + "adjacent literals: \"SELECT a.area_key, a.name FROM areas a JOIN cities c "
                            + "ON c.id = a.city_id \" + \"WHERE c.slug = ? AND a.area_slug = ? AND "
                            + "c.is_active = true\" — this scanner matches each double-quoted literal "
                            + "independently, so it sees only the first half (no is_active) and misses the "
                            + "is_active clause in the concatenated second half. Verified inline gated by "
                            + "reading the actual concatenated source."),
            new Allowance(
                    "com/example/realestate/area/AreaOverviewService.java",
                    "SELECT area_key, listing_count_90d, median_price_paise, trend_direction\n                FROM area_overview_stats\n                WHERE area_key = ANY(:keys)",
                    "queryComparison(nearbyAreaKeys) is only ever called from assembleResponse() AFTER "
                            + "cityActivationGuard.isActiveForAreaKey(areaKey) has already gated entry to the "
                            + "whole method (see the guard call a few lines above queryComparison's call site "
                            + "in assembleResponse). nearbyAreaKeys is data precomputed by the rollup job from "
                            + "the SAME already-gated area's row — not independently reachable with an "
                            + "attacker-supplied city/area."),
            new Allowance(
                    "com/example/realestate/discover/DiscoverSummaryService.java",
                    "FROM property_listings pl\n                JOIN areas a ON a.area_key = pl.area_key\n                WHERE",
                    "queryHotspots(): 'areas' is INNER JOINed to property_listings (not a LEFT JOIN — "
                            + "unlike the two genuinely-ungated queries below), and the immediately-appended "
                            + "sql.whereFragment() (DiscoverListingPredicateBuilder, verified gated) sits in "
                            + "the WHERE clause covering pl. For an inactive city the predicate's city subquery "
                            + "matches zero property_listings rows, so the INNER JOIN yields zero result rows "
                            + "— verified in CityActiveGating1935IT.hotspotsEmptyForInactiveCity_sameAsUnknown().")
    );

    private static File srcMainJava() {
        File dir = new File(System.getProperty("user.dir"));
        for (int i = 0; i < 6 && dir != null; i++) {
            File candidate = new File(dir, SRC_MAIN_JAVA);
            if (candidate.isDirectory()) {
                return candidate;
            }
            dir = dir.getParentFile();
        }
        throw new IllegalStateException(
                "Could not locate " + SRC_MAIN_JAVA + " by walking up from " + System.getProperty("user.dir"));
    }

    private record Allowance(String file, String fragment, String justification) {}

    private record Violation(String file, String methodName, String snippet) {
        @Override
        public String toString() {
            String truncated = snippet.length() > 160 ? snippet.substring(0, 160) + "..." : snippet;
            return file + " [" + methodName + "]: " + truncated.replaceAll("\\s+", " ");
        }
    }

    @Test
    void everyCityScopedQueryInScopeIsGatedOrExplicitlyAllowlisted() throws IOException {
        File root = srcMainJava();
        List<Violation> violations = new ArrayList<>();
        List<String> scannedFiles = new ArrayList<>();
        int candidateCount = 0;

        for (String relPath : SCAN_FILES) {
            File file = new File(root, relPath);
            assertThat(file).as("scan target must exist: %s", relPath).isFile();
            String content = Files.readString(file.toPath());
            scannedFiles.add(relPath);

            List<int[]> methodRanges = findMethodRanges(content);

            List<String> literals = new ArrayList<>();
            List<Integer> literalOffsets = new ArrayList<>();
            collect(TEXT_BLOCK_PATTERN, content, literals, literalOffsets);
            collect(STRING_LITERAL_PATTERN, content, literals, literalOffsets);

            for (int i = 0; i < literals.size(); i++) {
                String literal = literals.get(i);
                int offset = literalOffsets.get(i);
                if (!SQL_KEYWORD_PATTERN.matcher(literal).find()) {
                    continue;
                }
                if (!TABLE_PATTERN.matcher(literal).find()) {
                    continue;
                }
                candidateCount++;

                // (a) inline is_active
                if (literal.toLowerCase().contains("is_active")) {
                    continue;
                }

                // (b) enclosing method calls the guard
                String methodName = findEnclosingMethod(content, methodRanges, offset);
                int[] range = methodRangeFor(methodRanges, offset);
                if (range != null) {
                    String methodBody = content.substring(range[0], range[1]);
                    if (GUARD_CALL_PATTERN.matcher(methodBody).find()) {
                        continue;
                    }
                }

                // (c) explicit allowlist
                boolean allowlisted = ALLOWLIST.stream()
                        .anyMatch(a -> relPath.equals(a.file()) && literal.contains(a.fragment()));
                if (allowlisted) {
                    continue;
                }

                violations.add(new Violation(relPath, methodName, literal));
            }
        }

        assertThat(candidateCount)
                .as("sanity check: the scanner must find at least the known-gated queries "
                        + "(a zero count means the regexes stopped matching this codebase's SQL style "
                        + "and the whole test is vacuously green)")
                .isGreaterThan(10);

        assertThat(violations)
                .as("Every city-scoped SQL literal in %s must be gated inline (is_active), gated via "
                        + "cityActivationGuard in its enclosing method, or have a justified ALLOWLIST entry "
                        + "in this test. Violations found:%n%s",
                        scannedFiles,
                        violations.isEmpty() ? "(none)" : String.join("\n", violations.stream().map(Object::toString).toList()))
                .isEmpty();
    }

    private static void collect(Pattern pattern, String content, List<String> out, List<Integer> offsets) {
        Matcher m = pattern.matcher(content);
        while (m.find()) {
            out.add(m.group());
            offsets.add(m.start());
        }
    }

    private static List<int[]> findMethodRanges(String content) {
        List<int[]> ranges = new ArrayList<>();
        Matcher m = METHOD_START_PATTERN.matcher(content);
        while (m.find()) {
            int braceStart = content.indexOf('{', m.end() - 1);
            if (braceStart < 0) {
                continue;
            }
            int depth = 0;
            int i = braceStart;
            for (; i < content.length(); i++) {
                char c = content.charAt(i);
                if (c == '{') depth++;
                else if (c == '}') {
                    depth--;
                    if (depth == 0) break;
                }
            }
            ranges.add(new int[]{m.start(), Math.min(i + 1, content.length()), braceStart});
        }
        return ranges;
    }

    private static int[] methodRangeFor(List<int[]> ranges, int offset) {
        int[] best = null;
        for (int[] r : ranges) {
            if (offset >= r[0] && offset <= r[1]) {
                if (best == null || (r[1] - r[0]) < (best[1] - best[0])) {
                    best = r;
                }
            }
        }
        return best;
    }

    private static String findEnclosingMethod(String content, List<int[]> ranges, int offset) {
        int[] range = methodRangeFor(ranges, offset);
        if (range == null) {
            return "<static field / unknown method>";
        }
        Matcher m = METHOD_START_PATTERN.matcher(content.substring(range[0], Math.min(range[0] + 400, content.length())));
        if (m.find()) {
            return m.group(1);
        }
        return "<unknown>";
    }
}
