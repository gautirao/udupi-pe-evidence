/**
 * destinationCardFootprint.test.ts — Issue #1943, Slice A.
 *
 * The `FRESH_CORPUS` below is the full, un-truncated set of
 * `[data-testid="area-destination-marker"]` cards measured live at
 * 1920x1185 against production on 2026-08-22:
 *   - Bangalore (areas):        https://propertysignal.in/discover?city=bangalore&node=d%3Acentral&lat=12.97043&lon=77.59300&zoom=12
 *   - Udupi (areas):            https://propertysignal.in/discover?city=udupi
 *   - Bangalore (school-first): https://propertysignal.in/discover?city=bangalore&lat=12.97043&lon=77.59300&zoom=12
 *   - Udupi (school-first):     https://propertysignal.in/discover?city=udupi&journey=school-first
 * `label`/`listingCount`/`schoolCount` come from each card's live
 * `aria-label`; `width`/`height` from each card's live
 * `getBoundingClientRect()`. This is the SAME corpus the module doc cites,
 * and includes all 9 of the earlier cross-check cards (their widths/heights
 * match to the pixel). The last five rows (code review F1) specifically
 * target the count-FONT-SIZE ceiling at `listingCount>=240` /
 * `schoolCount>=20` (`AreaMarkerLayer.tsx:725`) — see the module doc's
 * "FOLLOW-UP MEASUREMENT (code review F1)" section for why no live
 * `schoolCount>=20` card exists in production today (neither city's
 * school-first structural destinations exceed 13), and why the areas-journey
 * ceiling cards are valid proof for both journeys' ceiling regardless.
 */
import { describe, it, expect } from 'vitest';
import {
  estimateDestinationCardFootprint,
  DESTINATION_CARD_FOOTPRINT_CONSTANTS,
  type DestinationCardFootprintInput,
} from '../destinationCardFootprint';
import type { DiscoverJourney } from '../journeyVisibility';

interface CorpusCard {
  label: string;
  listingCount: number | null;
  schoolCount: number | null;
  journey: DiscoverJourney;
  width: number;
  height: number;
}

function areasCard(
  label: string,
  listingCount: number | null,
  schoolCount: number | null,
  width: number,
  height: number,
): CorpusCard {
  return { label, listingCount, schoolCount, journey: 'areas', width, height };
}

const FRESH_CORPUS: readonly CorpusCard[] = [
  areasCard('Banashankari Temple Ward & Kumaraswamy Layout', 44, 2, 150.5, 130.5),
  areasCard('B.Hosahalli & Hosahalli', 18, null, 144.5, 111.75),
  areasCard('Shanti Nagar & Sudhama Nagar', 19, 3, 144.5, 129.5),
  areasCard('BTM Layout & Koramangala', 34, 4, 146.625, 129.5),
  areasCard('Domlur Layout & Kodihalli', 14, null, 144.65625, 111.75),
  areasCard('Nehru Nagar & Rajajinagar', 22, null, 144.5, 111.75),
  areasCard('Geddalahalli & Sanjaynagar', 10, null, 144.640625, 111),
  areasCard('Benson Town & Jayamahal', 9, null, 147.0625, 111),
  areasCard('Indira Nagar & Indiranagar', 15, 1, 144.640625, 129.5),
  areasCard('HBR Layout & Kammanahalli', 23, null, 156.75, 111.75),
  // Kunjibettu & Udupi (areas journey) — the outlier: zero-match structural
  // pill line + no primary count line (see the module doc for the full
  // explanation).
  areasCard('Kunjibettu & Udupi', 0, 13, 190.34375, 103.5),
  areasCard('Brahmavar & Hebri Area [TEST]', 6, 2, 146.25, 128.75),
  areasCard('Katapadi & Manipal', 8, 8, 144.46875, 128.75),
  areasCard('Padubidri & Shirva', 11, null, 144.953125, 111),
  areasCard('Malpe', 6, null, 142.40625, 111),
  // F1 follow-up: real cards at/past the count-font-size ceiling.
  areasCard('Langford Gardens & Lavelle Road', 208, 10, 150.640625, 136.5),
  areasCard('Harohalli & Ramanashree California Gardens Layout', 228, 4, 150.953125, 137.5),
  areasCard('Battarahalli & Medahalli', 650, 7, 148.71875, 137.5), // listingCount past the 240 ceiling
  areasCard('Chikkanagamangala & Electronic City Phase 2', 516, 11, 157.4375, 137.5), // past the 240 ceiling
  // school-first journey, real primary=schoolCount card (Udupi's highest
  // real schoolCount, 13 — still short of the 20-count ceiling; see doc).
  {
    label: 'Kunjibettu & Udupi',
    listingCount: 0,
    schoolCount: 13,
    journey: 'schools',
    width: 137.796875,
    height: 112.5,
  },
];

function input(card: CorpusCard): DestinationCardFootprintInput {
  return {
    displayLabel: card.label,
    listingCount: card.listingCount,
    schoolCount: card.schoolCount,
    journey: card.journey,
  };
}

describe('estimateDestinationCardFootprint — safe-direction invariant against the fresh corpus', () => {
  it.each(FRESH_CORPUS.map((card) => [card.label, card] as const))(
    'over-estimates both width and height for "%s"',
    (_label, card) => {
      const estimate = estimateDestinationCardFootprint(input(card));
      expect(estimate.widthPx).toBeGreaterThanOrEqual(card.width);
      expect(estimate.heightPx).toBeGreaterThanOrEqual(card.height);
    },
  );

  it('never returns a width below the real MIN_WIDTH_PX card floor', () => {
    for (const card of FRESH_CORPUS) {
      const estimate = estimateDestinationCardFootprint(input(card));
      expect(estimate.widthPx).toBeGreaterThanOrEqual(DESTINATION_CARD_FOOTPRINT_CONSTANTS.MIN_WIDTH_PX);
    }
  });
});

describe('estimateDestinationCardFootprint — determinism and purity', () => {
  it('returns identical output for identical input', () => {
    const a = input(FRESH_CORPUS[0]);
    const first = estimateDestinationCardFootprint(a);
    const second = estimateDestinationCardFootprint(a);
    expect(second).toEqual(first);
  });

  it('never mutates its input', () => {
    const a: DestinationCardFootprintInput = {
      displayLabel: 'Untouched Label',
      listingCount: 5,
      schoolCount: 2,
      journey: 'areas',
    };
    const snapshot = { ...a };
    estimateDestinationCardFootprint(a);
    expect(a).toEqual(snapshot);
  });
});

describe('estimateDestinationCardFootprint — monotonic safe direction', () => {
  it('a longer label never produces a smaller width estimate (up to the char cap)', () => {
    const short = estimateDestinationCardFootprint({
      displayLabel: 'Malpe',
      listingCount: 5,
      schoolCount: null,
      journey: 'areas',
    });
    const long = estimateDestinationCardFootprint({
      displayLabel: 'A Rather Long Canonical Cluster Name',
      listingCount: 5,
      schoolCount: null,
      journey: 'areas',
    });
    expect(long.widthPx).toBeGreaterThanOrEqual(short.widthPx);
  });

  it('a positive schoolCount in the areas journey adds height for the knowable secondary line', () => {
    const withoutSchools = estimateDestinationCardFootprint({
      displayLabel: 'X',
      listingCount: 5,
      schoolCount: null,
      journey: 'areas',
    });
    const withSchools = estimateDestinationCardFootprint({
      displayLabel: 'X',
      listingCount: 5,
      schoolCount: 3,
      journey: 'areas',
    });
    expect(withSchools.heightPx).toBe(
      withoutSchools.heightPx + DESTINATION_CARD_FOOTPRINT_CONSTANTS.EXTRA_LINE_HEIGHT_PX,
    );
  });

  it('a zero schoolCount does NOT count as a knowable secondary line (matches production: 0 -> null label)', () => {
    const zeroSchools = estimateDestinationCardFootprint({
      displayLabel: 'X',
      listingCount: 5,
      schoolCount: 0,
      journey: 'areas',
    });
    const nullSchools = estimateDestinationCardFootprint({
      displayLabel: 'X',
      listingCount: 5,
      schoolCount: null,
      journey: 'areas',
    });
    expect(zeroSchools.heightPx).toBe(nullSchools.heightPx);
  });

  it('the schools journey always reserves the secondary (listings) line height', () => {
    const schoolsJourney = estimateDestinationCardFootprint({
      displayLabel: 'X',
      listingCount: 0,
      schoolCount: 5,
      journey: 'schools',
    });
    const areasJourneyNoSecondary = estimateDestinationCardFootprint({
      displayLabel: 'X',
      listingCount: 0,
      schoolCount: null,
      journey: 'areas',
    });
    expect(schoolsJourney.heightPx).toBe(
      areasJourneyNoSecondary.heightPx + DESTINATION_CARD_FOOTPRINT_CONSTANTS.EXTRA_LINE_HEIGHT_PX,
    );
  });
});

describe('estimateDestinationCardFootprint — defensive input handling', () => {
  it('treats null/undefined/negative/non-finite counts as zero rather than throwing', () => {
    expect(() =>
      estimateDestinationCardFootprint({
        displayLabel: 'X',
        listingCount: undefined,
        schoolCount: Number.NaN,
        journey: 'areas',
      }),
    ).not.toThrow();
    expect(() =>
      estimateDestinationCardFootprint({
        displayLabel: 'X',
        listingCount: -5,
        schoolCount: null,
        journey: 'areas',
      }),
    ).not.toThrow();
  });
});
