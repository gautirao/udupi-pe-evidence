import { describe, it, expect } from 'vitest';
import { buildLocalDescription, type DescriptionFacts, type DescriptionPropertyType } from '../listingDescriptionBuilder';

// ---------------------------------------------------------------------------
// Issue #1718 — deterministic FE-only draft description builder.
// HARD CONSTRAINT: never fabricate proximity, legal/approval, school, ROI,
// verification, appreciation, or title-status claims — this builder must
// compose ONLY facts actually present on the input.
// ---------------------------------------------------------------------------

const FORBIDDEN_PHRASES = [
  'verified',
  'rera approved',
  'legally clear',
  'clear title',
  'walking distance',
  'minutes from',
  'close to school',
  'near school',
  'roi',
  'appreciation',
  'guaranteed',
  'best in class',
  'top-rated',
];

function baseFacts(overrides: Partial<DescriptionFacts> = {}): DescriptionFacts {
  return {
    propertyType: 'apartment',
    listingPurpose: 'sale',
    locality: 'Manipal',
    projectName: '',
    bedrooms: '3',
    bathrooms: '2',
    primaryAreaSqft: 1150,
    furnishingStatus: 'semi_furnished',
    facing: 'EAST',
    floorNumber: '4',
    totalFloors: '10',
    hasLift: true,
    hasPowerBackup: true,
    isGated: true,
    hasGarden: false,
    amenities: ['GYM', 'SWIMMING_POOL'],
    possessionStatus: 'READY_TO_MOVE',
    availabilityTimeline: '',
    priceRupees: 8_500_000,
    monthlyRent: null,
    securityDepositMonths: '',
    priceNegotiable: true,
    roadWidthFt: '',
    plotDimensions: '',
    ...overrides,
  };
}

const TYPES: DescriptionPropertyType[] = ['apartment', 'house', 'villa', 'residential_plot'];
const TONES = ['default', 'warm', 'short', 'factual'] as const;

describe('buildLocalDescription — never fabricates claims', () => {
  for (const type of TYPES) {
    for (const purpose of ['sale', 'rent'] as const) {
      for (const tone of TONES) {
        it(`${type} / ${purpose} / ${tone} — contains no forbidden phrase`, () => {
          const facts = baseFacts({
            propertyType: type,
            listingPurpose: purpose,
            monthlyRent: purpose === 'rent' ? 25000 : null,
            priceRupees: purpose === 'rent' ? null : 8_500_000,
            securityDepositMonths: purpose === 'rent' ? '10' : '',
          });
          const text = buildLocalDescription(facts, tone).toLowerCase();
          for (const phrase of FORBIDDEN_PHRASES) {
            expect(text).not.toContain(phrase);
          }
        });
      }
    }
  }
});

describe('buildLocalDescription — composes only entered facts', () => {
  it('omits amenities the broker never entered', () => {
    const facts = baseFacts({ hasLift: null, hasPowerBackup: null, isGated: null, amenities: [] });
    const text = buildLocalDescription(facts, 'default');
    expect(text).not.toMatch(/lift/i);
    expect(text).not.toMatch(/power backup/i);
    expect(text).not.toMatch(/gated/i);
  });

  it('includes the price only when entered', () => {
    const withPrice = buildLocalDescription(baseFacts({ priceRupees: 8_500_000 }), 'default');
    expect(withPrice).toMatch(/priced at/i);

    const withoutPrice = buildLocalDescription(baseFacts({ priceRupees: null }), 'default');
    expect(withoutPrice).not.toMatch(/priced at/i);
  });

  it('never mentions bedrooms/bathrooms for residential_plot', () => {
    const text = buildLocalDescription(
      baseFacts({ propertyType: 'residential_plot', bedrooms: '3', bathrooms: '2', primaryAreaSqft: 2400, facing: 'EAST', roadWidthFt: '30' }),
      'default',
    );
    expect(text).not.toMatch(/bathroom/i);
    expect(text).not.toMatch(/bhk/i);
    expect(text).toMatch(/plot/i);
  });
});

describe('buildLocalDescription — tone variations', () => {
  it('"short" tone yields fewer sentences than "default"', () => {
    const facts = baseFacts();
    const shortText = buildLocalDescription(facts, 'short');
    const defaultText = buildLocalDescription(facts, 'default');
    const countSentences = (s: string) => s.split('.').filter((x) => x.trim().length > 0).length;
    expect(countSentences(shortText)).toBeLessThanOrEqual(countSentences(defaultText));
  });

  it('"warm" tone includes an inviting closing line not present in "factual"', () => {
    const facts = baseFacts();
    const warmText = buildLocalDescription(facts, 'warm');
    const factualText = buildLocalDescription(facts, 'factual');
    expect(warmText).toMatch(/schedule a visit/i);
    expect(factualText).not.toMatch(/schedule a visit/i);
  });

  it('is deterministic — same facts + tone always produce the same text', () => {
    const facts = baseFacts();
    expect(buildLocalDescription(facts, 'default')).toBe(buildLocalDescription(facts, 'default'));
  });
});
