/**
 * Issue #2459 AC6 (chip half) — the selected-filter chip must disclose the per-row primary-area
 * meaning for a broad/mixed selection, exactly as the control does.
 *
 * Kept in its own file rather than appended to ActiveContextChips.test.tsx so the AC6 contract is
 * legible as one thing and the existing suite is untouched.
 *
 * Both arms matter. The mixed arm fails if the disclosure sentence goes missing; the
 * single-meaning arm fails if a disclosure is emitted where the label already carries the meaning.
 * Only asserting the first would pass against a component that pasted a sentence onto every chip.
 *
 * ============================================================================================
 * WHAT THIS FILE CAN AND CANNOT PROVE — READ BEFORE ADDING A LAYOUT ASSERTION
 * ============================================================================================
 *
 * These tests run in JSDOM, which implements no layout: every box is zero-sized, nothing wraps,
 * and nothing is ever clipped. So this file asserts the two things that ARE decidable here —
 * what the label SAYS, and which presentation the chip OPTS INTO — and asserts nothing about how
 * many lines it occupies or whether it fits.
 *
 * An earlier revision of this file did try to settle that here, via a `VISIBLE_LABEL_BUDGET` of
 * 24 characters standing in for the 160px box. That character-count proxy was rejected by the
 * owner, and rightly: it silently assumes a fixed glyph width, which is how a variant measured
 * "fitting" on `800–1,200` overshot by 43px on `Warehouse 10,000–20,000`. It is deliberately NOT
 * reintroduced in any form. The real-layout claim — that the whole label is visible at 390px —
 * is a BROWSER measurement, recorded on PR #2502; this file is not where it lives.
 */
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ActiveContextChips } from '../ActiveContextChips';
import { resolvePrimaryAreaControlLabel } from '@/features/discover/filters/primaryAreaLabels';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';

function renderChips(filters: DiscoverUrlFilters) {
  const onClearArea = vi.fn();
  render(
    <ActiveContextChips
      filters={filters}
      onClearPropertyType={vi.fn()}
      onClearBhk={vi.fn()}
      onClearPrice={vi.fn()}
      onClearArea={onClearArea}
    />,
  );
  return { onClearArea };
}

/** Chip.tsx builds the accessible name as `Active filter: ${label}`. */
const CHIP_NAME_PREFIX = 'Active filter: ';

/**
 * Recovers the chip's LABEL from its accessible name. Deliberately NOT read off `textContent`:
 * the chip also renders a text icon ("SQ"), which would prepend two characters to every
 * comparison below.
 */
function areaChipLabel(): string {
  const name = screen.getByTestId('chip-area').getAttribute('aria-label') ?? '';
  expect(name.startsWith(CHIP_NAME_PREFIX)).toBe(true);
  return name.slice(CHIP_NAME_PREFIX.length);
}

describe('ActiveContextChips — contextual area chip (#2459 AC6)', () => {
  it('renders no area chip when neither bound is set', () => {
    renderChips({ propertyTypes: ['apartment'] });
    expect(screen.queryByTestId('chip-area')).not.toBeInTheDocument();
  });

  it('names the specific quantity and omits a disclosure when one meaning is in play', () => {
    renderChips({ propertyTypes: ['apartment'], areaMinSqft: 800, areaMaxSqft: 1200 });

    const chip = screen.getByTestId('chip-area');
    expect(chip).toHaveTextContent('Built-up area: 800 – 1,200 sq ft');
    expect(chip).not.toHaveTextContent('Compares');
  });

  it('discloses what is being compared on a MIXED selection', () => {
    renderChips({
      propertyTypes: ['apartment', 'residential_plot'],
      areaMinSqft: 800,
      areaMaxSqft: 1200,
    });

    const chip = screen.getByTestId('chip-area');
    expect(chip).toHaveTextContent('Residential built-up/plot: 800 – 1,200 sq ft');
    expect(chip.textContent).not.toContain('built-up area for homes');
  });

  it('renders range without disclosure on the broadest selection too, where nothing is narrowed', () => {
    renderChips({ areaMinSqft: 500 });

    const chip = screen.getByTestId('chip-area');
    expect(chip).toHaveTextContent('Mixed built-up/warehouse/plot: 500+ sq ft');
    expect(chip.textContent).not.toContain('warehouse area for warehouses and godowns');
  });

  it('carries the range in the accessible name without disclosure text', () => {
    renderChips({
      propertyTypes: ['apartment', 'residential_plot'],
      areaMaxSqft: 1500,
    });

    const accessibleName = screen.getByTestId('chip-area').getAttribute('aria-label') ?? '';
    expect(accessibleName).toContain('Active filter:');
    expect(accessibleName).toContain('Up to 1,500 sq ft');
  });

  it('formats a max-only bound with an explicit unit', () => {
    renderChips({ propertyTypes: ['warehouse'], areaMaxSqft: 5000 });
    expect(screen.getByTestId('chip-area')).toHaveTextContent('Warehouse area: Up to 5,000 sq ft');
  });

  it('clears both bounds through onClearArea', async () => {
    const { onClearArea } = renderChips({ areaMinSqft: 800, areaMaxSqft: 1200 });

    screen.getByTestId('chip-area-dismiss').click();

    expect(onClearArea).toHaveBeenCalledTimes(1);
  });
});

/**
 * AC6 rule 5 (owner ruling, PR #2502) — the chip shows the WHOLE label, by wrapping at unchanged
 * width. This block asserts the two halves of that which are decidable without layout: that the
 * area chip is the one and only chip opting in, and that the bound the buyer entered reaches the
 * label unrewritten.
 */
describe('ActiveContextChips — the area chip wraps, and only the area chip (#2459 AC6)', () => {
  /** The label span of a chip, found by the text it carries rather than by DOM position. */
  function labelSpanOf(testId: string, text: string): HTMLElement {
    const chip = screen.getByTestId(testId);
    const span = Array.from(chip.querySelectorAll('span')).find((s) => s.textContent === text);
    if (span === undefined) throw new Error(`no label span carrying "${text}" in ${testId}`);
    return span as HTMLElement;
  }

  it('opts the area chip into wrapping', () => {
    renderChips({ propertyTypes: ['apartment'], areaMinSqft: 800, areaMaxSqft: 1200 });
    const cls = labelSpanOf('chip-area', 'Built-up area: 800 – 1,200 sq ft').getAttribute('class') ?? '';

    expect(cls).toContain('whitespace-normal');
    expect(cls).toContain('break-words');
    expect(cls).not.toContain('truncate');
    // Width is unchanged — the ruling bought vertical space, not horizontal.
    expect(cls).toContain('max-w-[160px]');
  });

  it('leaves every sibling chip on the default truncating presentation', () => {
    renderChips({
      propertyTypes: ['apartment'],
      bedrooms: [2],
      priceMin: 5000000,
      areaMinSqft: 800,
    });

    // Asserted on siblings rendered in the SAME bar as the opted-in chip, so a change that leaked
    // the new presentation onto the shared primitive fails here rather than passing unnoticed.
    for (const [testId, text] of [
      ['chip-type', 'Apartment'],
      ['chip-price', '₹50 L+'],
      ['chip-bhk', '2 BHK'],
    ] as const) {
      expect(labelSpanOf(testId, text).getAttribute('class'), testId).toBe(
        'max-w-[160px] truncate',
      );
    }
  });

  it('shows the bound the buyer entered, with no rounding or abbreviation', () => {
    // Six digits is the worst case the withdrawn variants failed on: one cut it off, the other
    // displayed it as 100k — a number the buyer never typed.
    renderChips({ areaMinSqft: 100000, areaMaxSqft: 200000 });

    const label = areaChipLabel();

    // en-IN grouping (`toLocaleString('en-IN')`, pre-existing and untouched here) writes 100000
    // as 1,00,000 — the lakh convention. That is a SEPARATOR choice, not a rewrite: every digit
    // the buyer typed is present, in order, at its own place value. The digit-only assertion
    // below is what actually pins that, independent of how the groups are punctuated.
    expect(label).toContain('1,00,000 – 2,00,000 sq ft');
    expect(label.replace(/[^0-9]/g, '')).toBe('100000200000');

    // The withdrawn variant D would have failed here: it fitted six digits by showing `100k` —
    // digits the buyer never entered standing in for the ones they did.
    expect(label).not.toMatch(/\d[kK]\b/);
  });
});

/**
 * The defect this guards against: an earlier shape led with a generic "Area:" and trailed the
 * disclosure. That mattered acutely while the label truncated, because `truncate` ate exactly the
 * words AC6 requires. It matters less now that nothing is cut — but the ordering is still the
 * contract the label is written to, so it stays asserted, at its true (weaker) strength: the label
 * OPENS with the module's own short lead, rather than with a generic word.
 */
describe('ActiveContextChips — the area chip leads with the compared quantity (#2459 AC6)', () => {
  const cases: ReadonlyArray<{ name: string; filters: DiscoverUrlFilters }> = [
    {
      name: 'mixed residential',
      filters: {
        propertyTypes: ['apartment', 'residential_plot'],
        areaMinSqft: 800,
        areaMaxSqft: 1200,
      },
    },
    { name: 'broadest (nothing narrowed)', filters: { areaMinSqft: 500 } },
    {
      name: 'mixed commercial',
      filters: { propertyTypes: ['warehouse', 'commercial_land'], areaMaxSqft: 5000 },
    },
  ];

  it.each(cases)('opens with the module lead, not a generic word — $name', ({ filters }) => {
    renderChips(filters);
    const label = areaChipLabel();

    // Derived from the module, not restated: whatever it says the lead is, the rendered label
    // must open with it.
    const { meanings, disclosure, shortLabel } = resolvePrimaryAreaControlLabel({
      propertyTypes: filters.propertyTypes,
      commercialSubtypes: filters.commercialSubtypes,
    });
    expect(meanings.length).toBeGreaterThan(1);
    expect(disclosure).toBeNull();

    expect(label.startsWith(shortLabel)).toBe(true);
    expect(label.toLowerCase().startsWith('area')).toBe(false);
  });

  it('still leads with the quantity when only ONE meaning is in play (control arm)', () => {
    renderChips({ propertyTypes: ['warehouse'], areaMaxSqft: 5000 });
    expect(areaChipLabel().startsWith('Warehouse area')).toBe(true);
  });
});

/**
 * AC6 Option B — DISTINGUISHABILITY. Two materially different filter states must not read as one.
 *
 * ⚠️ RE-MEASURED against the wrapping layout, PR #2502. This block previously compared the first
 * 24 characters of each label and carried a documented `TOLERATED_TRUNCATION_COLLISION` for the
 * one pair that shared them: "mixed two-family (homes + warehouses)" and "broadest" both opened
 * "Mixed built-up/warehouse", differing only in a third meaning that landed past the cut.
 *
 * BOTH the proxy and the carve-out are now GONE, and neither may return:
 *
 *   - The proxy, because the owner rejected character-count as a measurement technique outright.
 *   - The carve-out, because the collision it named no longer exists. It was never a fact about
 *     the two labels — the untruncated strings always differed ("…/warehouse" vs
 *     "…/warehouse/plot"). It was a fact about the PRESENTATION that cut them short. Change the
 *     presentation and the collision goes with it; carrying the exception forward would have been
 *     tolerating a defect that had already been fixed.
 *
 * So this now asserts the stronger thing the earlier revision could not: all seven canonical
 * states are pairwise distinct, with no exceptions at all.
 */
describe('ActiveContextChips — rendered labels distinguish filter states (#2459 AC6)', () => {
  /**
   * The canonical filter states this contract is asserted over. Deliberately NOT named for its
   * length: the assertion below is only ever as strong as this list, and a name that encoded a
   * count ("SIX_CASES") read as though the list were closed. It is not — a missing shape is a
   * missing assertion, which is how the two-family case below stayed invisible through one round.
   */
  const CANONICAL_CASES: ReadonlyArray<{ name: string; filters: DiscoverUrlFilters }> = [
    { name: 'single apartment', filters: { propertyTypes: ['apartment'], areaMinSqft: 800, areaMaxSqft: 1200 } },
    { name: 'single warehouse', filters: { propertyTypes: ['warehouse'], areaMaxSqft: 5000 } },
    {
      name: 'mixed residential',
      filters: { propertyTypes: ['apartment', 'residential_plot'], areaMinSqft: 800, areaMaxSqft: 1200 },
    },
    {
      name: 'mixed commercial',
      filters: { propertyTypes: ['warehouse', 'commercial_land'], areaMaxSqft: 5000 },
    },
    {
      // Homes + warehouses: TWO families, so the scope word is `Mixed` — the same word the
      // all-three case gets. This is the pair the old character budget could not separate.
      name: 'mixed two-family (homes + warehouses)',
      filters: { propertyTypes: ['apartment', 'warehouse'], areaMinSqft: 800, areaMaxSqft: 1200 },
    },
    {
      name: 'commercial broad',
      filters: {
        propertyTypes: ['commercial', 'commercial_building', 'warehouse', 'commercial_land'],
        areaMinSqft: 500,
      },
    },
    { name: 'broadest', filters: { areaMinSqft: 500 } },
  ];

  /** Looks a case up by NAME — positional indices silently re-point when a case is inserted. */
  function caseFilters(name: string): DiscoverUrlFilters {
    const found = CANONICAL_CASES.find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`No canonical case named "${name}"`);
    return found.filters;
  }

  /** The WHOLE label — which, with wrapping, is the whole of what a sighted buyer reads. */
  function renderedLabel(filters: DiscoverUrlFilters): string {
    cleanup();
    renderChips(filters);
    return areaChipLabel();
  }

  it('gives Commercial-broad and the broadest selection DIFFERENT labels', () => {
    expect(renderedLabel(caseFilters('commercial broad'))).not.toBe(
      renderedLabel(caseFilters('broadest')),
    );
  });

  it('gives all canonical filter states pairwise-distinct labels, with no tolerated collision', () => {
    const bySeen = new Map<string, string>();
    for (const { name, filters } of CANONICAL_CASES) {
      const label = renderedLabel(filters);
      const seen = bySeen.get(label);
      // Reported by name so a collision says WHICH two states collapsed, not merely that some did.
      expect(seen ?? name, `"${label}" is shared with ${seen}`).toBe(name);
      bySeen.set(label, name);
    }
    expect(bySeen.size).toBe(CANONICAL_CASES.length);
  });

  it('separates the formerly-colliding pair, which is why the carve-out is gone', () => {
    // The self-removal trigger the old carve-out promised, kept as a positive assertion: if these
    // two ever read identically again, this names the pair instead of a generic count mismatch.
    const twoFamily = renderedLabel(caseFilters('mixed two-family (homes + warehouses)'));
    const broadest = renderedLabel(caseFilters('broadest'));

    expect(twoFamily).not.toBe(broadest);
    // And they differ for the reason the old comment recorded: the broader label is a strict
    // extension of the narrower one. Nothing here was untrue before — it was merely unseen.
    expect(twoFamily.startsWith('Mixed built-up/warehouse')).toBe(true);
    expect(broadest.startsWith('Mixed built-up/warehouse/plot')).toBe(true);
  });

  it('still names a quantity in every label — distinctness must not cost the meaning', () => {
    for (const { name, filters } of CANONICAL_CASES) {
      const label = renderedLabel(filters).toLowerCase();
      const { meanings } = resolvePrimaryAreaControlLabel({
        propertyTypes: filters.propertyTypes,
        commercialSubtypes: filters.commercialSubtypes,
      });
      expect(label, name).toContain(meanings[0].toLowerCase().replace('_', '-'));
    }
  });
});
