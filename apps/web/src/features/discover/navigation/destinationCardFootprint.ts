/**
 * destinationCardFootprint.ts — Issue #1943, Slice A.
 *
 * Pure, deterministic estimator for the on-screen footprint (width/height in
 * CSS px) of a rendered `[data-testid="area-destination-marker"]` card
 * (`AreaMarkerLayer.tsx`'s `makeSingleAreaChildCard`/cluster-card builders).
 * This module is PURE: no DOM, no Leaflet, no React, no randomness. It never
 * measures the real DOM itself — `hierarchyCameraFit.ts` needs a footprint
 * *before* a card is ever painted (to pick a camera that will not clip or
 * overlap it once it IS painted), so the estimate has to be computed from the
 * same inputs the card builder itself uses.
 *
 * ── SAFE DIRECTION: OVER-ESTIMATE, NEVER UNDER-ESTIMATE ──
 * Exactly the same invariant `areaClustering.ts` documents for
 * `AREA_CARD_FOOTPRINT_WIDTH_PX`/`AREA_CARD_FOOTPRINT_HEIGHT_PX` (see that
 * module, lines ~111-127): over-estimating a card's footprint only ever
 * causes an extra, unnecessary merge/decluttering step downstream — still
 * correct, just more conservative. UNDER-estimating is the only way the
 * resolver's no-overlap/no-clip invariant can actually fail (a card the
 * resolver thought was small enough clips or collides for real). Every
 * constant below is therefore rounded UP from a measured or reasoned bound,
 * never down, and every per-input term is chosen so that adding more content
 * can only ever grow the estimate.
 *
 * ── EVIDENCE (fresh 1920x1185 measurement, 2026-08-22, production) ──
 * `[data-testid="area-destination-marker"]` cards, Bangalore
 * (?city=bangalore&node=d%3Acentral&lat=12.97043&lon=77.59300&zoom=12) and
 * Udupi (?city=udupi):
 *
 *   label                                          | count | w        | h
 *   "Banashankari Temple Ward & Kumaraswamy Layout" | 44    | 150.5    | 130.5
 *   "B.Hosahalli & Hosahalli"                       | 18    | 144.5    | 111.75
 *   "Shanti Nagar & Sudhama Nagar"                  | 19    | 144.5    | 129.5
 *   "BTM Layout & Koramangala"                      | 34    | 146.625  | 129.5
 *   "Domlur Layout & Kodihalli"                     | -     | 144.656  | 111.75
 *   "Nehru Nagar & Rajajinagar"                     | -     | 144.5    | 111.75
 *   "Geddalahalli & Sanjaynagar"                    | -     | 144.641  | 111
 *   "Benson Town & Jayamahal"                       | -     | 147.063  | 111
 *   "Indira Nagar & Indiranagar"                    | -     | 144.641  | 129.5
 *   "HBR Layout & Kammanahalli"                     | -     | 156.75   | 111.75
 *   "Kunjibettu & Udupi"                            | 0*    | 190.344  | 103.5
 *   "Brahmavar & Hebri Area [TEST]"                 | -     | 146.25   | 128.75
 *   "Katapadi & Manipal"                            | -     | 144.469  | 128.75
 *   "Padubidri & Shirva"                            | -     | 144.953  | 111
 *   "Malpe"                                         | -     | 142.406  | 111
 *
 * These agree with the 9-card cross-check corpus carried over from an
 * earlier pass (same labels, same widths/heights to within rounding) — this
 * is a genuine, reproducible rendering behaviour, not a one-off glitch.
 *
 * ── FOLLOW-UP MEASUREMENT (code review F1) — the count-FONT-SIZE ceiling ──
 * `AreaMarkerLayer.tsx:725` computes the primary-count row's font size as
 * `round(22 + min(1, primaryCountNum / (isSchools ? 20 : 240)) * 9)` — a
 * 22-31px range that (per `:731`) is `line-height:1`, so the font size
 * directly drives that row's height, and therefore the whole card's height.
 * The ORIGINAL corpus above tops out at `listingCount=44` (journey `'areas'`
 * throughout) — nowhere near either ceiling (240 for areas, 20 for schools).
 *
 * A second live pass specifically targeted the ceiling. Bangalore's
 * `journey=school-first` structural (Direction-level) destinations top out
 * at `schoolCount=13` (Udupi's top out at 13 too) — genuinely never reaching
 * the 20-count schools ceiling anywhere in the current production dataset
 * for either city; I could not produce a real `schoolCount>=20` card and am
 * not fabricating one. What DID reach the ceiling live is the `'areas'`
 * journey (`listingCount>=240`), at the SAME production URL used for the
 * original pass:
 *
 *   label                                          | journey | count(primary/secondary) | w        | h
 *   "Langford Gardens & Lavelle Road"               | areas   | 208 listings / 10 schools | 150.641  | 136.5
 *   "Harohalli & Ramanashree California Gardens..." | areas   | 228 listings / 4 schools  | 150.953  | 137.5
 *   "Battarahalli & Medahalli"                      | areas   | 650 listings / 7 schools  | 148.719  | 137.5
 *   "Chikkanagamangala & Electronic City Phase 2"   | areas   | 516 listings / 11 schools | 157.4375 | 137.5
 *   "Kunjibettu & Udupi" (journey=school-first)     | schools | 13 schools / 0 listings   | 137.797  | 112.5
 *
 * `listingCount=650` and `516` are both far past the 240-count ceiling, so
 * both cards are rendering the row at its maximum 31px font — confirmed
 * arithmetically: the 137.5px height is exactly 7px taller than the
 * previous 4-line max (130.5px, `listingCount=44`, font
 * `round(22+44/240*9)=24px`); `31-24=7`, matching the height delta exactly,
 * which is the `line-height:1` relationship stated above, not a
 * coincidence.
 *
 * `round(22 + min(1, n/20)*9)` (schools) and `round(22 + min(1, n/240)*9)`
 * (areas) are the SAME formula shape with a different divisor — both are
 * bounded by the identical `[22,31]` range and BOTH reach the identical 31px
 * ceiling once `n` crosses their respective threshold. The ceiling's height
 * contribution therefore does not depend on which journey or which raw count
 * triggered it, only on whether the ceiling was reached at all — so the real
 * 650-listing/137.5px card IS a valid, live-measured proof point for the
 * schools-journey ceiling too, even though no real `schoolCount>=20` card
 * exists to measure directly. `BASE_HEIGHT_PX`/`EXTRA_LINE_HEIGHT_PX` below
 * are re-derived to clear 137.5px with real margin (previously only 6.5px),
 * and all five new rows are pinned in the estimator's test corpus.
 *
 * No real card measured in either pass under-estimates against the
 * (re-derived) constants below — if one ever does, per the issue's stop
 * condition, that is a STOP-and-report situation, not a quiet retune.
 *
 * ── WHY THE SHORTEST LABEL GAVE THE WIDEST CARD ──
 * `AreaMarkerLayer.tsx` truncates the visible NAME to `TRUNCATE_MAX_CHARS =
 * 18` characters (private constant, ~line 225: `truncateAreaLabel`) before
 * it is ever painted — confirmed by inspecting the live DOM: every card's
 * name `<span>` has `textContent.length === 18` whenever the real
 * `displayLabel` is longer than that (e.g. "Banashankari Templ…"), and the
 * full name is recoverable only via `title`/`aria-label`. A 45-char label and
 * an 18-char label therefore paint the SAME name-line width budget; the
 * plan's `width = clamp(..., ceil(maxLineChars * CHAR_WIDTH_UPPER_BOUND_PX) +
 * ...)` hypothesis, if `maxLineChars` were the untruncated `displayLabel`
 * length, does NOT hold in production and is discarded (see below).
 *
 * "Kunjibettu & Udupi" (190.34x103.5) is the true outlier and is NOT
 * explained by name width at all: live DOM inspection of that exact node
 * shows its card has NO primary count line (no "listings"/"schools" number
 * row) and instead a SECOND, wider content line — the structural zero-match
 * pill copy `NO_MATCHES_WITH_CURRENT_FILTERS` from `journeyVisibility.ts`
 * ("No matches with current filters", a LOCKED, fixed-length literal, not a
 * per-city string) rendered at 10px/600-weight, plus a `"13 schools"`
 * secondary line. Measured via `canvas.measureText`, the zero-match literal
 * alone is ~146px wide before its own pill padding — comfortably explaining
 * the 190px card once the pill's own `padding:1px 9px` and the card's own
 * `padding:8px 12px`/border are added. The card is a flex COLUMN with no
 * fixed width, so its rendered width is the WIDEST of whichever content
 * lines happen to be present — not a function of the name label alone.
 *
 * ── WHAT THIS MEANS FOR THE ESTIMATOR ──
 * `estimateDestinationCardFootprint`'s inputs are `{ displayLabel,
 * listingCount, schoolCount, journey }` — there is no `matchingAreaCount`
 * input, so this module CANNOT know from its inputs alone whether the
 * zero-match pill line will be the one that actually renders for a given
 * card (`matchingAreaCount` is a distinct backend-provided field from
 * `listingCount`/`schoolCount` — see `NavigationChildCard.tsx`'s doc comment
 * — so it cannot be reliably derived from either count). Per the safe-
 * direction rule above, the fix is NOT to guess a narrower bound: the
 * estimator reserves width for that pill's known worst-case content
 * UNCONDITIONALLY, on every card. This is a deliberate, flagged
 * over-conservative choice — see the module's final report for the
 * follow-up recommendation (thread `matchingAreaCount` through in a later
 * slice to tighten this).
 *
 * The width estimate is therefore the widest of:
 *   1. the name line, sized from the FULL (untruncated) `displayLabel`
 *      length, capped at `MAX_LABEL_CHARS_FOR_WIDTH` (chosen comfortably
 *      above the private `TRUNCATE_MAX_CHARS = 18` so a modest future change
 *      to that private constant cannot silently turn this into an
 *      under-estimate);
 *   2. the primary count line (a mono digit run + an uppercase unit word);
 *   3. the always-reserved areas-pill line (see above);
 *   4. the secondary count line (the OTHER journey's count + word).
 * The height estimate is a flat, input-sensitive-but-safe bound in the same
 * spirit as `AREA_CARD_FOOTPRINT_HEIGHT_PX`: a base covering name + one
 * metric row + the (always-reserved) areas-pill row, plus one more row's
 * worth of height whenever a second metric row is knowably possible from the
 * inputs (`journey === 'schools'`, which always carries a secondary listings
 * line, or a positive `schoolCount` in the `'areas'` journey).
 */
import type { DiscoverJourney } from './journeyVisibility';

/** Card content, exactly as `AreaMarkerLayer.tsx`'s destination-card builders receive it. */
export interface DestinationCardFootprintInput {
  displayLabel: string;
  listingCount: number | null | undefined;
  schoolCount: number | null | undefined;
  journey: DiscoverJourney;
}

export interface DestinationCardFootprint {
  widthPx: number;
  heightPx: number;
}

// ── Verified real inputs (AreaMarkerLayer.tsx / markerPrimitives.ts) ──
/** `AreaMarkerLayer.tsx:715` — `cardContainerStyle({ minWidthPx: 96, ... })`. */
const MIN_WIDTH_PX = 96;
/** `markerPrimitives.ts:106` — `padding:8px 12px` (content box, not border-box). */
const H_PADDING_PX = 24; // 12px * 2 sides
const V_PADDING_PX = 16; // 8px * 2 sides
/** `AreaMarkerLayer.tsx:711` (`AreaMarkerLayer.tsx:713` uses `borderColor`) — `1.5px solid`. */
const BORDER_PX = 3; // 1.5px * 2 sides
/** `cardContainerStyle`'s `gap:2px` between each stacked content line. */
const LINE_GAP_PX = 2;

// ── Calibrated, deliberately-rounded-UP constants ──
// Name line: font-weight 700, 12.5px, "Plus Jakarta Sans" (AreaMarkerLayer.tsx
// destination card name span). Measured via canvas.measureText against the
// live page: the widest common Latin glyph ("M") is ~11.16px/char at this
// weight/size — rounded up to 12 so no real character can exceed the bound.
// SAFE-DIRECTION CAVEAT (alongside the `matchingAreaCount` one above): this
// bound is derived from the widest LATIN glyph. `displayLabel` today is
// always a Latin-script place name; if a non-Latin script (e.g. Kannada,
// Devanagari) ever reaches `displayLabel`, this constant would need
// re-measuring against that script's own widest glyph before this module
// could still be trusted not to under-estimate.
const CHAR_WIDTH_UPPER_BOUND_PX = 12;
// The private `TRUNCATE_MAX_CHARS` in AreaMarkerLayer.tsx is 18. We do NOT
// import/hardcode that private constant directly (it is not exported, and
// coupling this module's SAFETY invariant to an unexported implementation
// detail risks a silent under-estimate if it ever changes without this file
// being updated in lockstep). Instead we cap at a value comfortably above
// it, so today's real 18-char truncation is always covered with margin.
const MAX_LABEL_CHARS_FOR_WIDTH = 24;

// Primary/secondary count digit run: mono, font-weight 800, up to 31px
// (see COUNT_FONT_SIZE below). Measured "9,999" at 800/31px "JetBrains Mono"
// is ~93.3px / 5 chars = ~18.66px/char (digits and separators alike) —
// rounded up to 19.
const MONO_DIGIT_WIDTH_UPPER_BOUND_PX = 19;
// Between the count number and its unit word (`gap:5px` in the destination
// card's count row).
const COUNT_GAP_PX = 5;
// Uppercase unit word ("LISTINGS"/"SCHOOLS"), font-weight 700, 9.5px sans.
// Measured "LISTINGS" (the longer of the two) at 700/9.5px is ~42.6px —
// rounded up to 46.
const UNIT_LABEL_WIDTH_PX = 46;

// Areas-pill line — ALWAYS reserved (see module doc: `matchingAreaCount` is
// not part of this estimator's input surface, so its presence/absence can
// never be safely ruled out). Measured `NO_MATCHES_WITH_CURRENT_FILTERS`
// ("No matches with current filters") at 600/10px "Plus Jakarta Sans" is
// ~146.3px, plus the pill's own `padding:1px 9px` (18px) — rounded up to a
// flat 170px reserve.
const AREAS_PILL_RESERVED_WIDTH_PX = 170;

// Secondary metric line ("<count> listings"/"<count> schools" as ONE span,
// 600/10.5px sans). Measured "9,999 listings" (14 chars) is ~65.9px / 14 =
// ~4.71px/char — rounded up to 5. The word itself is bounded by the longer
// of "listings" (8 chars) / "schools" (7 chars).
const SECONDARY_CHAR_WIDTH_UPPER_BOUND_PX = 5;
const SECONDARY_WORD_CHARS = 8; // "listings"

// Line heights (flat, conservative bounds — see module doc: height cannot be
// pinned as exactly as width by CSS, so this mirrors
// AREA_CARD_FOOTPRINT_HEIGHT_PX's "flat worst-case bound" approach rather
// than modelling exact line boxes). Calibrated so BASE_HEIGHT_PX alone
// exceeds every 3-line-or-fewer card measured (max observed 111.75px) and
// BASE_HEIGHT_PX + EXTRA_LINE_HEIGHT_PX exceeds every 4-line card measured —
// including the count-FONT-SIZE CEILING cases (`listingCount>=240` /
// `schoolCount>=20`, `AreaMarkerLayer.tsx:725`), whose real max is 137.5px
// (`"Battarahalli & Medahalli"`, `listingCount=650`; see the module doc's
// "FOLLOW-UP MEASUREMENT (code review F1)" section for the full evidence and
// for why that areas-journey ceiling card is valid proof for the
// schools-journey ceiling too — both journeys' count row hits the identical
// 31px font ceiling, just at different raw counts). 152 clears 137.5 with
// 14.5px of real margin, not the 6.5px the pre-F1 constants left.
const BASE_HEIGHT_PX = 120;
const EXTRA_LINE_HEIGHT_PX = 32;

function safeCount(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/** Conservative (over-counting) estimate of `n.toLocaleString()`'s character length. */
function digitRunCharsUpperBound(n: number): number {
  const digits = String(Math.max(0, Math.trunc(Math.abs(n)))).length;
  // en-IN grouping inserts a separator every 2 digits after the first 3 —
  // over-count at one separator per 2 digits so this can only overshoot.
  const separators = Math.ceil(digits / 2);
  return digits + separators;
}

/**
 * Estimates a destination card's rendered footprint from the same inputs the
 * card builder consumes. Deliberately over-estimating — see module doc.
 * Never mutates its input.
 */
export function estimateDestinationCardFootprint(
  input: DestinationCardFootprintInput,
): DestinationCardFootprint {
  const isSchools = input.journey === 'schools';
  const listingCount = safeCount(input.listingCount);
  const schoolCount = safeCount(input.schoolCount);
  const primaryCount = isSchools ? schoolCount : listingCount;
  const secondaryCount = isSchools ? listingCount : schoolCount;

  const nameChars = Math.min(input.displayLabel.length, MAX_LABEL_CHARS_FOR_WIDTH);
  const nameLineWidthPx = nameChars * CHAR_WIDTH_UPPER_BOUND_PX;

  const primaryCountLineWidthPx =
    digitRunCharsUpperBound(primaryCount) * MONO_DIGIT_WIDTH_UPPER_BOUND_PX +
    COUNT_GAP_PX +
    UNIT_LABEL_WIDTH_PX;

  const secondaryLineWidthPx =
    (digitRunCharsUpperBound(secondaryCount) + 1 + SECONDARY_WORD_CHARS) *
    SECONDARY_CHAR_WIDTH_UPPER_BOUND_PX;

  const widestContentPx = Math.max(
    nameLineWidthPx,
    primaryCountLineWidthPx,
    AREAS_PILL_RESERVED_WIDTH_PX,
    secondaryLineWidthPx,
  );

  const widthPx = Math.max(
    MIN_WIDTH_PX,
    Math.ceil(widestContentPx + H_PADDING_PX + BORDER_PX),
  );

  // A second metric row is knowably possible from the inputs alone whenever:
  //  - journey is 'schools' (its secondary line is the listings count, which
  //    is always a renderable number), or
  //  - journey is 'areas' and schoolCount is positive (the schools secondary
  //    line is only ever omitted when schoolCount is null/0).
  const hasKnowableSecondaryLine = isSchools || schoolCount > 0;
  const heightPx = Math.ceil(
    BASE_HEIGHT_PX + (hasKnowableSecondaryLine ? EXTRA_LINE_HEIGHT_PX : 0),
  );

  return { widthPx, heightPx };
}

// Exported for tests / cross-module reuse (never re-typed locally elsewhere).
export const DESTINATION_CARD_FOOTPRINT_CONSTANTS = {
  MIN_WIDTH_PX,
  H_PADDING_PX,
  V_PADDING_PX,
  BORDER_PX,
  LINE_GAP_PX,
  CHAR_WIDTH_UPPER_BOUND_PX,
  MAX_LABEL_CHARS_FOR_WIDTH,
  MONO_DIGIT_WIDTH_UPPER_BOUND_PX,
  COUNT_GAP_PX,
  UNIT_LABEL_WIDTH_PX,
  AREAS_PILL_RESERVED_WIDTH_PX,
  SECONDARY_CHAR_WIDTH_UPPER_BOUND_PX,
  SECONDARY_WORD_CHARS,
  BASE_HEIGHT_PX,
  EXTRA_LINE_HEIGHT_PX,
} as const;
