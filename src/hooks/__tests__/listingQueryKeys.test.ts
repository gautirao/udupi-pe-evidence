/**
 * listingQueryKeys — Issue #1462 (agri peek → detail cache alignment)
 *
 * Verifies the cache key factory contract: distinct auth tiers produce distinct
 * keys, null/undefined ids are normalised to null, and the 'listing' prefix
 * enables bulk invalidation.
 *
 * Tests:
 * 1  anon vs authed keys for the same id are distinct
 * 2  different ids produce distinct keys (regardless of auth tier)
 * 3  authed key ends with 'authed'; anon key ends with 'anon'
 * 4  null id → ['listing', 'public', null, 'anon']
 * 5  undefined id → ['listing', 'public', null, 'authed'] (coerced to null)
 * 6  all key shapes start with 'listing' (enables bulk invalidation)
 */

import { describe, it, expect } from 'vitest';
import { listingKeys } from '../../lib/listingQueryKeys';

const ID_A = 'listing-uuid-aaa';
const ID_B = 'listing-uuid-bbb';

describe('listingKeys factory (Issue #1462)', () => {
  it('1: listingKeys.public(id, true) ≠ listingKeys.public(id, false) — anon/authed are distinct', () => {
    const authedKey = listingKeys.public(ID_A, true);
    const anonKey   = listingKeys.public(ID_A, false);
    expect(authedKey).not.toEqual(anonKey);
  });

  it('2: listingKeys.public("id-A", true) ≠ listingKeys.public("id-B", true) — different ids are distinct', () => {
    const keyA = listingKeys.public(ID_A, true);
    const keyB = listingKeys.public(ID_B, true);
    expect(keyA).not.toEqual(keyB);
  });

  it("3: authed key ends with 'authed'; anon key ends with 'anon'", () => {
    const authedKey = listingKeys.public(ID_A, true);
    const anonKey   = listingKeys.public(ID_A, false);
    expect(authedKey[authedKey.length - 1]).toBe('authed');
    expect(anonKey[anonKey.length - 1]).toBe('anon');
  });

  it("4: listingKeys.public(null, false) returns ['listing', 'public', null, 'anon']", () => {
    expect(listingKeys.public(null, false)).toEqual(['listing', 'public', null, 'anon']);
  });

  it("5: listingKeys.public(undefined, true) returns ['listing', 'public', null, 'authed'] (undefined coerced to null)", () => {
    expect(listingKeys.public(undefined, true)).toEqual(['listing', 'public', null, 'authed']);
  });

  it("6: all key shapes start with 'listing' (prefix enables bulk invalidation)", () => {
    expect(listingKeys.all[0]).toBe('listing');
    expect(listingKeys.public(ID_A, true)[0]).toBe('listing');
    expect(listingKeys.public(ID_A, false)[0]).toBe('listing');
    expect(listingKeys.preview(ID_A)[0]).toBe('listing');
    expect(listingKeys.priceHistory(ID_A)[0]).toBe('listing');
    expect(listingKeys.trust(ID_A)[0]).toBe('listing');
  });
});
