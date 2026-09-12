/**
 * Issue #2459 — the primary-area label/disclosure mapping.
 *
 * These assertions are written against EXPLICIT selections declared here, not against any seeded
 * fixture, so none of them can pass over an empty set. (#2524: no Commercial row in the E2E
 * fixture carries `built_area` or `land_area`, so a Commercial area assertion driven off that
 * fixture would be vacuous. Nothing here reads it.)
 */
import { describe, it, expect } from 'vitest';
import { COMMERCIAL_TYPES, DISCOVER_COMMERCIAL_SUBTYPES } from '@/lib/listing-constants';
import { resolveBuyerCommercialSubtype } from '@/lib/propertyTypeConfig';
import {
  BROAD_PRIMARY_AREA_LABEL,
  MIXED_SCOPE_SHORT,
  PRIMARY_AREA_DISCLOSURE_TERMS,
  PRIMARY_AREA_LABELS,
  PRIMARY_AREA_QUANTITY,
  PRIMARY_AREA_QUANTITY_SHORT,
  PRIMARY_AREA_SCOPE_SHORT,
  UNNAMED_AREA_SHORT_LABEL,
  resolvePrimaryAreaControlLabel,
  resolvePrimaryAreaFamily,
  resolvePrimaryAreaMeaning,
  type PrimaryAreaSelection,
} from './primaryAreaLabels';

describe('resolvePrimaryAreaMeaning — mirrors DiscoverPrimaryArea.resolve', () => {
  it.each([
    ['apartment', 'BUILT_UP'],
    ['villa', 'BUILT_UP'],
    ['house', 'BUILT_UP'],
    ['residential_plot', 'PLOT'],
    ['land', 'PLOT'],
    ['agricultural_land', 'PLOT'],
    ['commercial_building', 'BUILT_UP'],
    ['warehouse', 'WAREHOUSE'],
    ['commercial_land', 'PLOT'],
  ])('%s resolves to %s from property_type alone', (type, expected) => {
    expect(resolvePrimaryAreaMeaning(type, null)).toBe(expected);
  });

  it('resolves a subtype-less `commercial` row by CONVERGENCE, not by guessing a subtype', () => {
    // Both admissible readings (SHOP, OFFICE) mean BUILT_UP, so the MEANING is determined even
    // though the SUBTYPE is not. This is the owner's post-approval rule, and it decides whether
    // the 3 LIVE subtype-less commercial rows are filterable at all.
    expect(resolvePrimaryAreaMeaning('commercial', null)).toBe('BUILT_UP');
  });

  it('uses an explicit subtype when one is given', () => {
    expect(resolvePrimaryAreaMeaning('commercial', 'SHOP')).toBe('BUILT_UP');
    expect(resolvePrimaryAreaMeaning('commercial', 'OFFICE')).toBe('BUILT_UP');
  });

  it('reaches every commercial meaning THROUGH resolveBuyerCommercialSubtype, not a local literal', () => {
    // #2459 review fix 2 — `ADMISSIBLE_SUBTYPES` is derived by inverting the resolver that
    // `contracts/commercial-subtype-mapping.json` pins across the language boundary, so a change
    // to that mapping lands here for free instead of leaving a fourth hand-written copy behind.
    //
    // This test is the COUPLING claim, and the expectations are deliberately HARD-CODED rather
    // than re-derived from the resolver: re-deriving them would move both sides of the assertion
    // together and pass no matter what. Written this way, mutating `resolveBuyerCommercialSubtype`
    // breaks these expectations — which is the observable difference between a derived table and
    // the literal it replaced.
    //
    // Non-vacuity first: the inversion must actually produce subtypes for every commercial type.
    for (const type of COMMERCIAL_TYPES) {
      const admissible = DISCOVER_COMMERCIAL_SUBTYPES.filter(
        (s) => resolveBuyerCommercialSubtype(type, s) === s,
      );
      expect(admissible.length).toBeGreaterThan(0);
    }
    expect(resolvePrimaryAreaMeaning('commercial', null)).toBe('BUILT_UP');
    expect(resolvePrimaryAreaMeaning('commercial_building', null)).toBe('BUILT_UP');
    expect(resolvePrimaryAreaMeaning('warehouse', null)).toBe('WAREHOUSE');
    expect(resolvePrimaryAreaMeaning('commercial_land', null)).toBe('PLOT');
  });

  it('treats `other` as UNRESOLVED — no admissible set bounds what such a row is', () => {
    expect(resolvePrimaryAreaMeaning('other', null)).toBe('UNRESOLVED');
  });

  it('is UNRESOLVED for an unmapped, null or blank type rather than defaulting to a quantity', () => {
    expect(resolvePrimaryAreaMeaning('spaceship', null)).toBe('UNRESOLVED');
    expect(resolvePrimaryAreaMeaning(null)).toBe('UNRESOLVED');
    expect(resolvePrimaryAreaMeaning('   ')).toBe('UNRESOLVED');
  });

  it('does not let an unrecognised subtype become a guess — it falls back to the type', () => {
    expect(resolvePrimaryAreaMeaning('warehouse', 'RESTAURANT')).toBe('WAREHOUSE');
    expect(resolvePrimaryAreaMeaning('other', 'RESTAURANT')).toBe('UNRESOLVED');
  });

  it('is case- and whitespace-insensitive on both axes', () => {
    expect(resolvePrimaryAreaMeaning('  Apartment ', null)).toBe('BUILT_UP');
    expect(resolvePrimaryAreaMeaning('commercial', ' office ')).toBe('BUILT_UP');
  });

  it('has NO carpet meaning — AC1 ruling, not an oversight', () => {
    const allMeanings = new Set(
      ['apartment', 'villa', 'house', 'residential_plot', 'land', 'agricultural_land',
       'commercial', 'commercial_building', 'warehouse', 'commercial_land', 'other']
        .map((t) => resolvePrimaryAreaMeaning(t, null)),
    );
    expect([...allMeanings].sort()).toEqual(['BUILT_UP', 'PLOT', 'UNRESOLVED', 'WAREHOUSE']);
    expect(Object.keys(PRIMARY_AREA_LABELS)).not.toContain('CARPET');
  });
});

describe('resolvePrimaryAreaFamily', () => {
  it.each([
    ['apartment', 'residential'],
    ['residential_plot', 'residential'],
    ['land', 'residential'],
    ['agricultural_land', 'agricultural'],
    ['commercial', 'commercial'],
    ['warehouse', 'commercial'],
    ['commercial_land', 'commercial'],
  ])('%s belongs to the %s family', (type, expected) => {
    expect(resolvePrimaryAreaFamily(type)).toBe(expected);
  });

  it('gives `other` no family — it has no disclosable subject', () => {
    expect(resolvePrimaryAreaFamily('other')).toBeNull();
  });
});

describe('resolvePrimaryAreaControlLabel — single meaning needs no disclosure', () => {
  it('labels a dwelling-only selection BUILT-UP AREA (SQ FT), not carpet', () => {
    const r = resolvePrimaryAreaControlLabel({ propertyTypes: ['apartment', 'villa', 'house'] });
    expect(r.label).toBe('BUILT-UP AREA (SQ FT)');
    expect(r.disclosure).toBeNull();
    expect(r.meanings).toEqual(['BUILT_UP']);
  });

  it('labels a plot-only selection PLOT SIZE (SQ FT)', () => {
    const r = resolvePrimaryAreaControlLabel({ propertyTypes: ['residential_plot'] });
    expect(r.label).toBe('PLOT SIZE (SQ FT)');
    expect(r.disclosure).toBeNull();
  });

  it('labels a warehouse-only selection WAREHOUSE AREA (SQ FT)', () => {
    const r = resolvePrimaryAreaControlLabel({ propertyTypes: ['warehouse'] });
    expect(r.label).toBe('WAREHOUSE AREA (SQ FT)');
    expect(r.disclosure).toBeNull();
  });

  it('labels Shop/Office — including a narrowed subtype selection — BUILT-UP', () => {
    const r = resolvePrimaryAreaControlLabel({
      propertyTypes: ['commercial'],
      commercialSubtypes: ['SHOP', 'OFFICE'],
    });
    expect(r.label).toBe('BUILT-UP AREA (SQ FT)');
    expect(r.disclosure).toBeNull();
  });
});

describe('resolvePrimaryAreaControlLabel — AC6: a mixed selection MUST disclose', () => {
  it('discloses both quantities for a broad/mixed Residential selection', () => {
    const r = resolvePrimaryAreaControlLabel({
      propertyTypes: ['apartment', 'house', 'residential_plot'],
    });
    expect(r.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(r.disclosure).toBe('Compares built-up area for homes; plot size for plots.');
    expect(r.meanings).toEqual(['BUILT_UP', 'PLOT']);
  });

  it('discloses all three quantities for a broad/mixed Commercial selection', () => {
    const r = resolvePrimaryAreaControlLabel({
      propertyTypes: ['commercial', 'commercial_building', 'warehouse', 'commercial_land'],
    });
    expect(r.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(r.disclosure).toBe(
      'Compares built-up area for shops, offices and commercial buildings; ' +
        'warehouse area for warehouses and godowns; plot size for commercial land.',
    );
    expect(r.meanings).toEqual(['BUILT_UP', 'WAREHOUSE', 'PLOT']);
  });

  it('discloses only the quantities actually in play, not the family’s whole vocabulary', () => {
    const r = resolvePrimaryAreaControlLabel({ propertyTypes: ['warehouse', 'commercial_land'] });
    expect(r.disclosure).toBe(
      'Compares warehouse area for warehouses and godowns; plot size for commercial land.',
    );
    expect(r.disclosure).not.toContain('built-up');
  });

  it('spans families when the selection does', () => {
    const r = resolvePrimaryAreaControlLabel({ propertyTypes: ['apartment', 'warehouse'] });
    expect(r.disclosure).toBe(
      'Compares built-up area for homes; warehouse area for warehouses and godowns.',
    );
  });

  it('treats "nothing selected" as the broadest mixture and still discloses', () => {
    const empty = resolvePrimaryAreaControlLabel({});
    expect(empty.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(empty.disclosure).not.toBeNull();
    expect(empty.meanings).toEqual(['BUILT_UP', 'WAREHOUSE', 'PLOT']);
    // An empty array must behave identically to an absent one.
    expect(resolvePrimaryAreaControlLabel({ propertyTypes: [] })).toEqual(empty);
  });

  it('NEVER returns a broad label without a disclosure while more than one meaning is in play', () => {
    // The failure mode D1 forbids, asserted as an invariant over every subset rather than as a
    // property of the handful of selections spelled out above.
    const types = ['apartment', 'villa', 'house', 'residential_plot', 'land', 'agricultural_land',
      'commercial', 'commercial_building', 'warehouse', 'commercial_land', 'other'];
    for (let mask = 1; mask < 1 << types.length; mask++) {
      const propertyTypes = types.filter((_, i) => mask & (1 << i));
      const r = resolvePrimaryAreaControlLabel({ propertyTypes });
      if (r.meanings.length > 1) {
        expect(r.label, JSON.stringify(propertyTypes)).toBe(BROAD_PRIMARY_AREA_LABEL);
        expect(r.disclosure, JSON.stringify(propertyTypes)).not.toBeNull();
      } else if (r.meanings.length === 1) {
        expect(r.label, JSON.stringify(propertyTypes)).toBe(PRIMARY_AREA_LABELS[r.meanings[0]]);
      }
    }
  });
});

describe('resolvePrimaryAreaControlLabel — unresolvable rows', () => {
  it('flags an unresolvable member without letting it change the label', () => {
    const withOther = resolvePrimaryAreaControlLabel({ propertyTypes: ['apartment', 'other'] });
    expect(withOther.label).toBe('BUILT-UP AREA (SQ FT)');
    expect(withOther.disclosure).toBeNull();
    expect(withOther.hasUnresolved).toBe(true);
  });

  it('gives an `other`-only selection no quantity to name and nothing to disclose', () => {
    const r = resolvePrimaryAreaControlLabel({ propertyTypes: ['other'] });
    expect(r.meanings).toEqual([]);
    expect(r.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(r.disclosure).toBeNull();
    expect(r.hasUnresolved).toBe(true);
  });
});

/**
 * The six selections the owner named when rejecting the truncated chip. Declared once, here, and
 * reused by the chip suite's own visible-lead assertions so the two cannot describe different
 * worlds.
 */
const CANONICAL_SELECTIONS: ReadonlyArray<{ name: string; selection: PrimaryAreaSelection }> = [
  { name: 'single apartment', selection: { propertyTypes: ['apartment'] } },
  { name: 'single warehouse', selection: { propertyTypes: ['warehouse'] } },
  {
    name: 'mixed residential',
    selection: { propertyTypes: ['apartment', 'residential_plot'] },
  },
  {
    name: 'mixed commercial',
    selection: { propertyTypes: ['warehouse', 'commercial_land'] },
  },
  {
    name: 'commercial broad',
    selection: {
      propertyTypes: ['commercial', 'commercial_building', 'warehouse', 'commercial_land'],
    },
  },
  { name: 'broadest', selection: {} },
];

describe('shortLabel — the visible lead on a width-constrained surface (#2459 AC6)', () => {
  it.each([
    ['single apartment', 'Built-up area'],
    ['single warehouse', 'Warehouse area'],
    ['mixed residential', 'Residential built-up/plot'],
    ['mixed commercial', 'Commercial warehouse/plot'],
    ['commercial broad', 'Commercial built-up/warehouse/plot'],
    ['broadest', 'Mixed built-up/warehouse/plot'],
  ])('%s reads "%s"', (name, expected) => {
    const { selection } = CANONICAL_SELECTIONS.find((c) => c.name === name)!;
    expect(resolvePrimaryAreaControlLabel(selection).shortLabel).toBe(expected);
  });

  /**
   * THE defect the owner reopened this for. Commercial-broad and the broadest selection span the
   * SAME three meanings, so any short form built from meanings alone renders them identically —
   * which is what the long forms did once `truncate` had taken its cut. Only the scope word tells
   * them apart, so this is asserted on its own and not merely implied by the table above.
   */
  it('distinguishes a Commercial-broad selection from the broadest one', () => {
    const commercialBroad = resolvePrimaryAreaControlLabel({
      propertyTypes: ['commercial', 'commercial_building', 'warehouse', 'commercial_land'],
    });
    const broadest = resolvePrimaryAreaControlLabel({});

    expect(commercialBroad.meanings).toEqual(broadest.meanings);
    expect(commercialBroad.shortLabel).not.toBe(broadest.shortLabel);
  });

  it('gives every canonical selection a DISTINCT short label', () => {
    const shortLabels = CANONICAL_SELECTIONS.map(
      ({ selection }) => resolvePrimaryAreaControlLabel(selection).shortLabel,
    );
    expect(new Set(shortLabels).size).toBe(CANONICAL_SELECTIONS.length);
  });

  it('reports the families in play, in canonical order', () => {
    expect(resolvePrimaryAreaControlLabel({}).families).toEqual([
      'residential',
      'commercial',
      'agricultural',
    ]);
    expect(resolvePrimaryAreaControlLabel({ propertyTypes: ['warehouse'] }).families).toEqual([
      'commercial',
    ]);
    expect(resolvePrimaryAreaControlLabel({ propertyTypes: ['other'] }).families).toEqual([]);
  });

  it('leads a multi-family mixture with the mixed scope word, never a single family’s name', () => {
    const r = resolvePrimaryAreaControlLabel({ propertyTypes: ['apartment', 'warehouse'] });
    expect(r.families).toEqual(['residential', 'commercial']);
    expect(r.shortLabel).toBe(`${MIXED_SCOPE_SHORT} built-up/warehouse`);
  });

  it('names nothing it cannot resolve — an `other`-only selection stays generic', () => {
    expect(resolvePrimaryAreaControlLabel({ propertyTypes: ['other'] }).shortLabel).toBe(
      UNNAMED_AREA_SHORT_LABEL,
    );
  });

  it('keeps the FULL quantity name when only one meaning is in play — nothing to buy by cutting', () => {
    for (const meaning of ['BUILT_UP', 'PLOT', 'WAREHOUSE'] as const) {
      const type = { BUILT_UP: 'apartment', PLOT: 'residential_plot', WAREHOUSE: 'warehouse' }[
        meaning
      ];
      const { shortLabel } = resolvePrimaryAreaControlLabel({ propertyTypes: [type] });
      expect(shortLabel.toLowerCase()).toBe(PRIMARY_AREA_QUANTITY[meaning]);
    }
  });
});

describe('the short vocabulary is DATA, complete and genuinely shorter', () => {
  it('has a short form for every meaning that has a long one, and it is no longer', () => {
    for (const meaning of Object.keys(PRIMARY_AREA_QUANTITY) as Array<
      keyof typeof PRIMARY_AREA_QUANTITY
    >) {
      const short = PRIMARY_AREA_QUANTITY_SHORT[meaning];
      expect(short).toBeTruthy();
      expect(short.length).toBeLessThan(PRIMARY_AREA_QUANTITY[meaning].length);
    }
    expect(Object.keys(PRIMARY_AREA_QUANTITY_SHORT).sort()).toEqual(
      Object.keys(PRIMARY_AREA_QUANTITY).sort(),
    );
  });

  it('has a scope word for every family that can appear in a disclosure', () => {
    for (const family of Object.keys(PRIMARY_AREA_DISCLOSURE_TERMS) as Array<
      keyof typeof PRIMARY_AREA_DISCLOSURE_TERMS
    >) {
      expect(PRIMARY_AREA_SCOPE_SHORT[family]).toBeTruthy();
    }
  });
});

describe('the disclosure is DATA, not a string baked into a component', () => {
  it('every disclosure term names a meaning that has both a label and a quantity phrase', () => {
    for (const terms of Object.values(PRIMARY_AREA_DISCLOSURE_TERMS)) {
      for (const term of terms) {
        expect(PRIMARY_AREA_LABELS[term.meaning]).toBeTruthy();
        expect(term.subject).toBeTruthy();
      }
    }
  });
});
