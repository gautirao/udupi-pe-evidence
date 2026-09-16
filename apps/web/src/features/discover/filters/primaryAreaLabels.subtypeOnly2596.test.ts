/**
 * Issue #2596 — a SUBTYPE-ONLY selection must label the shape it selected.
 *
 * Under the one-axis buyer contract, picking a single Commercial subtype emits only
 * `commercialSubtypes` (`?subtype=SHOP`) and NO `propertyTypes`. The resolver treated that
 * empty-types case as "no narrowing at all" and fell back to every property type, so three
 * meanings landed in play and the caller got the broad `AREA (SQ FT)` PLUS the mixed disclosure
 * — for a selection that is not mixed.
 *
 * Measured on the live route before the fix: Shop, Warehouse / Godown and Commercial Land each
 * rendered `AREA (SQ FT)` with the full "compares built-up … warehouse … plot size" sentence
 * while exactly one shape was selected. That is #2596's stated AC ("Contextual Area is visible
 * and correctly labelled for every shape") failing systematically, and the stray disclosure is
 * its own defect — the sentence exists to explain a MIXTURE.
 *
 * The table was never wrong. `MEANING_BY_SUBTYPE` already mapped all five subtypes correctly;
 * the subtypes simply never reached it. So these cases pin the SELECTION-shaping rule, and the
 * negative assertions matter as much as the positive ones: asserting only the new label would
 * still pass if the stray disclosure came back.
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePrimaryAreaControlLabel,
  BROAD_PRIMARY_AREA_LABEL,
} from './primaryAreaLabels';

describe('#2596 — subtype-only selections label their own shape', () => {
  it.each([
    ['SHOP', 'BUILT-UP AREA (SQ FT)'],
    ['OFFICE', 'BUILT-UP AREA (SQ FT)'],
    ['BUILDING', 'BUILT-UP AREA (SQ FT)'],
    ['WAREHOUSE', 'WAREHOUSE AREA (SQ FT)'],
    ['LAND', 'PLOT SIZE (SQ FT)'],
  ])('%s alone → %s, with NO mixed disclosure', (subtype, expected) => {
    const r = resolvePrimaryAreaControlLabel({ commercialSubtypes: [subtype] });
    expect(r.label).toBe(expected);
    // The label must be the SPECIFIC one, not merely "some string" — pin the negative too.
    expect(r.label).not.toBe(BROAD_PRIMARY_AREA_LABEL);
    // A single shape is not a mixture, so the disclosure must be absent.
    expect(r.disclosure).toBeNull();
    expect(r.meanings).toHaveLength(1);
  });

  // THE CONTROL ARM. This behaviour was already correct and must stay correct — a fix that
  // specialised everything would break the honest broad case, which is the failure mode #2459 D1
  // exists to prevent.
  it('broad Commercial (family tokens, no subtype) still gets the broad label AND a disclosure', () => {
    const r = resolvePrimaryAreaControlLabel({
      propertyTypes: ['commercial', 'commercial_building', 'warehouse', 'commercial_land'],
    });
    expect(r.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(r.disclosure).not.toBeNull();
    expect(r.meanings.length).toBeGreaterThan(1);
  });

  it('no narrowing at all still gets the broad label AND a disclosure', () => {
    const r = resolvePrimaryAreaControlLabel({});
    expect(r.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(r.disclosure).not.toBeNull();
  });

  // Two subtypes that disagree are a genuine mixture and must read as one.
  it('SHOP + WAREHOUSE together is a real mixture → broad label + disclosure', () => {
    const r = resolvePrimaryAreaControlLabel({ commercialSubtypes: ['SHOP', 'WAREHOUSE'] });
    expect(r.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(r.disclosure).not.toBeNull();
    expect(r.meanings).toEqual(['BUILT_UP', 'WAREHOUSE']);
  });

  // Two subtypes that AGREE converge on one meaning, so they are not a mixture.
  it('SHOP + OFFICE both mean built-up → the specific label, no disclosure', () => {
    const r = resolvePrimaryAreaControlLabel({ commercialSubtypes: ['SHOP', 'OFFICE'] });
    expect(r.label).toBe('BUILT-UP AREA (SQ FT)');
    expect(r.disclosure).toBeNull();
  });

  // The narrowing is deliberately scoped: an explicit type narrowing still wins, so a
  // hand-written mixed URL is untouched.
  it('an explicit non-commercial type alongside a subtype is left as the mixture it is', () => {
    const r = resolvePrimaryAreaControlLabel({
      propertyTypes: ['apartment', 'commercial'],
      commercialSubtypes: ['LAND'],
    });
    expect(r.meanings.length).toBeGreaterThan(1);
    expect(r.label).toBe(BROAD_PRIMARY_AREA_LABEL);
    expect(r.disclosure).not.toBeNull();
  });
});
