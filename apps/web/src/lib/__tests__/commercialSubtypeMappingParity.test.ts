import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveBuyerCommercialSubtype } from '@/lib/propertyTypeConfig';

/**
 * #2458 — the TYPESCRIPT half of the cross-language mapping parity check.
 *
 * The Commercial buyer-subtype mapping is implemented twice, because it is needed on both sides of
 * the language boundary: here, and in `DiscoverListingsService.resolveBuyerCommercialSubtype`
 * (Java). The duplication is unavoidable. Leaving it unchecked is not.
 *
 * **Neither side's own suite can detect one-sided drift.** The frontend vocabulary and URL tests
 * prove this side is self-consistent; the server membership tests prove that side is. Both stay
 * green while the five-value vocabulary is identical on both sides and the two resolvers disagree
 * about what a given row maps to.
 *
 * The sibling is
 * `apps/api/src/test/java/com/example/realestate/discover/CommercialSubtypeMappingParityTest.java`.
 * Both read `contracts/commercial-subtype-mapping.json`, so changing either implementation alone
 * turns that side RED.
 */

interface ParityCase {
  name: string;
  propertyType: string | null;
  commercialSubtype: string | null;
  expected: string | null;
}

// Resolved from the vitest root (apps/web) to the repo-root contracts directory. Read via fs
// rather than imported, so BOTH sides consume the identical bytes rather than a bundler's copy.
const FIXTURE_PATH = resolve(__dirname, '../../../../../contracts/commercial-subtype-mapping.json');

describe('#2458 — cross-language mapping parity', () => {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  const cases: ParityCase[] = JSON.parse(raw).cases;

  it('the fixture is present AND complete — a truncated one must not pass quietly', () => {
    // TWO DISTINCT FAILURE MODES, caught by two different mechanisms. An earlier version of this
    // comment credited both to the assertion below, which was wrong in a way that invites deleting
    // it as redundant:
    //
    //   * PATH BREAKAGE throws at COLLECTION time -- readFileSync/JSON.parse run in the describe
    //     body, before any `it` executes, so vitest surfaces it as a suite error. Loud already;
    //     this assertion has nothing to do with it.
    //   * TRUNCATED OR EMPTIED FIXTURE is what this guard actually catches: the file is present
    //     and parses, `cases` is short or [], and `it.each` generates ZERO tests. A loop over zero
    //     cases passes, which is the fail-open shape this project keeps hitting.
    //
    // Do not remove this on the reasoning that "the path throws anyway" -- that closes the loud
    // hole and leaves the silent one open.
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(cases)(
    'resolves $name — ($propertyType, $commercialSubtype) -> $expected',
    ({ propertyType, commercialSubtype, expected }) => {
      // A failure here is a DIVERGENCE FROM THE JAVA RESOLVER, not merely a failed expectation:
      // the fixture is the shared contract both sides assert against. Fix the mapping, or change
      // the contract deliberately on BOTH sides — never edit the fixture to match one side.
      expect(resolveBuyerCommercialSubtype(propertyType, commercialSubtype)).toBe(expected);
    },
  );

  it('covers every buyer peer, both null cases, and the precedence case', () => {
    // Without this, a future edit could delete the discriminating cases and leave the parity test
    // passing over a trivial subset — green, and protecting nothing.
    const expectations = cases.map((c) => c.expected);
    expect(expectations).toEqual(
      expect.arrayContaining(['SHOP', 'OFFICE', 'BUILDING', 'WAREHOUSE', 'LAND', null]),
    );

    const names = cases.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'legacy-generic-commercial',
        'non-commercial',
        'self-describing-type-ignores-a-conflicting-subtype',
      ]),
    );
  });
});
