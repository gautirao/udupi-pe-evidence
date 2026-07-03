package com.example.realestate.listing.api;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Wiring guard — asserts that no {@code validate*} method in {@link ListingController}
 * references any forward-only (author-only) set from the authority classes.
 *
 * <p>Forward-only sets declare the M38 design vocabulary for the typed model arriving in #1689.
 * Wiring them today would fail at runtime because:
 * <ul>
 *   <li>{@code VALID_FENCING_STATUSES} / {@code VALID_YN} target future enum columns;
 *       the current columns ({@code fencingDone}, {@code farmhouseAvailable}) are Boolean —
 *       Jackson parses them as {@code true}/{@code false}/{@code null}, not strings.</li>
 *   <li>Other forward sets ({@code VALID_FACING_VALUES}, {@code VALID_TERRAIN_VALUES}, etc.)
 *       have no corresponding request field on the flat {@code CreateRequest}/{@code UpdateRequest}
 *       today.</li>
 * </ul>
 *
 * <p>If this test fails it means a {@code validate*} method was accidentally wired to a
 * forward-only constant — remove the {@code rejectIfUnknown} call for that constant or
 * promote the field to wired status (with the required post-audit evidence, M38-FU7).
 *
 * <h2>Extraction method</h2>
 * <p>The source file is scanned for every {@code private static void validate*} header.
 * Each method body is extracted via <b>brace-depth counting</b> (not a {@code [^}]*}
 * regex): a running depth counter increments on {@code {} and decrements on {@code }};
 * the body ends when depth returns to zero. This correctly captures methods that contain
 * nested braces ({@code if}, {@code for}, lambda, {@code try} blocks, etc.) and will
 * never silently truncate the body — any such truncation would cause the guard-found-methods
 * assertion to fail before any forward-constant check runs.
 */
class ListingFieldWiringGuardTest {

    /**
     * Forward-only constant tokens that must NOT appear in any {@code validate*} method body.
     * This array is the single source of truth: add a new entry here whenever a new forward-only
     * set is added to an authority class, so the guard automatically covers it.
     */
    private static final String[] FORWARD_ONLY_CONSTANTS = {
            // AgriFieldOptions forward sets
            "VALID_FACING_VALUES",
            "VALID_POSSESSION_VALUES",
            "VALID_FENCING_STATUSES",
            "VALID_TERRAIN_VALUES",
            "VALID_WATER_DESIGN",
            "VALID_SOIL_DESIGN",
            "VALID_CROPS",
            "VALID_LOCATION_FEATURES",
            "VALID_CONVERSION_STATUSES",
            "VALID_AGRI_AREA_UNITS",
            "VALID_YN",
            // CommercialFieldOptions is now WIRED (M38-FU2 / #1730 — validateCommercialFields /
            // validateCommercialFieldSet in ListingController) and intentionally removed from this
            // forward-only list. Do not re-add it without removing the real rejectIfUnknown wiring.
            // ResidentialFieldOptions (all author-only; guard by class name)
            "ResidentialFieldOptions",
    };

    /** Pattern to locate validate* method headers (opening brace position is m.end() - 1). */
    private static final Pattern VALIDATE_HEADER_PATTERN = Pattern.compile(
            "private\\s+static\\s+void\\s+validate\\w+\\s*\\([^)]*\\)\\s*\\{",
            Pattern.DOTALL);

    private static String validateMethodBodies;

    @BeforeAll
    static void loadControllerSource() throws Exception {
        Path controllerPath = Paths.get(System.getProperty("user.dir"))
                .resolve("src/main/java/com/example/realestate/listing/api/ListingController.java")
                .toAbsolutePath()
                .normalize();

        assertThat(controllerPath.toFile())
                .as("ListingController source must exist at %s", controllerPath)
                .exists()
                .isFile();

        String source = Files.readString(controllerPath);

        // ── Brace-depth extraction ─────────────────────────────────────────────
        // For each validate* method header, scan forward character-by-character
        // with a depth counter.  Depth starts at 1 (the header's own opening brace),
        // increments at '{', decrements at '}'.  When depth reaches 0 we have the
        // entire method body — including any nested if/for/lambda/try blocks.
        StringBuilder bodies = new StringBuilder();
        Matcher m = VALIDATE_HEADER_PATTERN.matcher(source);
        int foundMethods = 0;
        while (m.find()) {
            // m.end() is one past the header's '{'; body starts at that position.
            int bodyStart = m.end();
            int depth = 1;
            int pos = bodyStart;
            while (pos < source.length() && depth > 0) {
                char c = source.charAt(pos);
                if (c == '{') depth++;
                else if (c == '}') depth--;
                pos++;
            }
            // pos is now one past the closing '}'; body is [bodyStart, pos - 1).
            bodies.append(source, bodyStart, pos - 1).append('\n');
            foundMethods++;
        }

        assertThat(foundMethods)
                .as("Expected at least one validate* method in ListingController "
                        + "(brace-depth extraction found none — check the header regex)")
                .isGreaterThanOrEqualTo(1);

        validateMethodBodies = bodies.toString();
    }

    // ── Single parameterized test driven from FORWARD_ONLY_CONSTANTS ──────────

    /**
     * Asserts that none of the known forward-only constant tokens appears in any
     * {@code validate*} method body extracted from {@link ListingController}.
     *
     * <p>Adding a new forward-only set to {@link #FORWARD_ONLY_CONSTANTS} automatically
     * extends coverage — no new test method is needed.
     */
    @ParameterizedTest(name = "validate* methods must not reference forward constant: {0}")
    @MethodSource("forwardOnlyConstants")
    void validateMethods_doNotReferenceForwardConstant(String constantToken) {
        assertThat(validateMethodBodies)
                .as("Forward-only constant '%s' must NOT appear in any validate* method body "
                        + "in ListingController. Remove the rejectIfUnknown call for this constant "
                        + "or promote the field to wired status with required post-audit evidence (M38-FU7).",
                        constantToken)
                .doesNotContain(constantToken);
    }

    // ── Method source ─────────────────────────────────────────────────────────

    static Stream<String> forwardOnlyConstants() {
        return Arrays.stream(FORWARD_ONLY_CONSTANTS);
    }
}
