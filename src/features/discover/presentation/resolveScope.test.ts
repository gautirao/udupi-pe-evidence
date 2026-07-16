import { describe, it, expect } from 'vitest';
import { resolveScope, CANONICAL_REGION_KEYS, type ScopeNamespaces } from './resolveScope';

const ns: ScopeNamespaces = {
  regionKeys: new Set(['east', 'north']),
  groupSlugs: new Set(['tech-corridor', 'south-udupi']),
  areaKeys: new Set(['IN|KA|Bengaluru|Whitefield']),
};

describe('resolveScope', () => {
  it('classifies a region key as kind:region', () => {
    expect(resolveScope('east', ns)).toEqual({ kind: 'region', regionKey: 'east' });
  });

  it('classifies a group slug as kind:group', () => {
    expect(resolveScope('tech-corridor', ns)).toEqual({ kind: 'group', groupSlug: 'tech-corridor' });
  });

  it('classifies an area key as kind:area', () => {
    expect(resolveScope('IN|KA|Bengaluru|Whitefield', ns)).toEqual({
      kind: 'area',
      areaKey: 'IN|KA|Bengaluru|Whitefield',
    });
  });

  it('classifies an unrecognized value as kind:none', () => {
    expect(resolveScope('nonexistent-slug', ns)).toEqual({ kind: 'none' });
  });

  it('returns kind:none for an empty string', () => {
    expect(resolveScope('', ns)).toEqual({ kind: 'none' });
  });

  it('returns kind:none for null', () => {
    expect(resolveScope(null, ns)).toEqual({ kind: 'none' });
  });

  it('returns kind:none for undefined', () => {
    expect(resolveScope(undefined, ns)).toEqual({ kind: 'none' });
  });

  it('classifies as kind:none when areaKeys namespace is omitted, even if the value matches no region/group', () => {
    const nsWithoutAreaKeys: ScopeNamespaces = {
      regionKeys: new Set(['east']),
      groupSlugs: new Set(['tech-corridor']),
    };
    expect(resolveScope('IN|KA|Bengaluru|Whitefield', nsWithoutAreaKeys)).toEqual({ kind: 'none' });
  });

  it('region-first tie-break: a value present in BOTH regionKeys and groupSlugs resolves to region (synthetic collision — inert in production per #1910 disjointness invariant)', () => {
    const collidingNs: ScopeNamespaces = {
      regionKeys: new Set(['ambiguous-token']),
      groupSlugs: new Set(['ambiguous-token']),
    };
    expect(resolveScope('ambiguous-token', collidingNs)).toEqual({
      kind: 'region',
      regionKey: 'ambiguous-token',
    });
  });

  it('is pure — does not mutate the input namespaces', () => {
    const regionKeys = new Set(['east']);
    const groupSlugs = new Set(['tech-corridor']);
    const frozenNs: ScopeNamespaces = { regionKeys, groupSlugs };
    resolveScope('east', frozenNs);
    expect(regionKeys.size).toBe(1);
    expect(groupSlugs.size).toBe(1);
  });

  it('never throws on malformed input', () => {
    expect(() => resolveScope('   ', ns)).not.toThrow();
    expect(() => resolveScope('%%%', ns)).not.toThrow();
  });
});

// Issue #1910 (PR2 fix-up, Finding 1) — groupNameSlugs alias fallback, restoring
// the pre-#1910 ad-hoc `g.name.toLowerCase() === activeScope.toLowerCase()` /
// `labelToSlug(g.name) === activeScope` clauses that plain `groupSlugs`
// membership does not reproduce (a group's `id`/slug is not always literally
// `labelToSlug(name)` — see the ScopeNamespaces.groupNameSlugs JSDoc for the
// real `kr-puram-belt` / "K R Puram Belt" counterexample from seed data).
describe('resolveScope — groupNameSlugs alias fallback', () => {
  const nsWithAlias: ScopeNamespaces = {
    regionKeys: new Set(['east']),
    groupSlugs: new Set(['kr-puram-belt']),
    groupNameSlugs: new Map([
      ['k-r-puram-belt', 'kr-puram-belt'], // labelToSlug('K R Puram Belt')
      ['k r puram belt', 'kr-puram-belt'], // name.toLowerCase()
    ]),
  };

  it('resolves a labelToSlug(name)-derived alias to the canonical group id (kind:group)', () => {
    expect(resolveScope('k-r-puram-belt', nsWithAlias)).toEqual({
      kind: 'group',
      groupSlug: 'kr-puram-belt',
    });
  });

  it('the canonical id itself still resolves directly via groupSlugs (unaffected by the alias map)', () => {
    expect(resolveScope('kr-puram-belt', nsWithAlias)).toEqual({
      kind: 'group',
      groupSlug: 'kr-puram-belt',
    });
  });

  it('classifies as kind:none when groupNameSlugs is omitted, even if the value would have matched an alias', () => {
    const nsWithoutAlias: ScopeNamespaces = {
      regionKeys: new Set(['east']),
      groupSlugs: new Set(['kr-puram-belt']),
    };
    expect(resolveScope('k-r-puram-belt', nsWithoutAlias)).toEqual({ kind: 'none' });
  });

  it('regionKeys still take precedence over a groupNameSlugs alias on collision', () => {
    const collidingNs: ScopeNamespaces = {
      regionKeys: new Set(['ambiguous-alias']),
      groupSlugs: new Set(['some-group']),
      groupNameSlugs: new Map([['ambiguous-alias', 'some-group']]),
    };
    expect(resolveScope('ambiguous-alias', collidingNs)).toEqual({
      kind: 'region',
      regionKey: 'ambiguous-alias',
    });
  });
});

// Issue #1910 (PR2 review fix) — canonical region keys, tested against the
// REAL backend vocabulary (uppercase 'N'/'E'/'S'/'W'/'CENTRAL'/'NE'/'SE'/
// 'SW'/'NW' — see CityRegionProjection.FULL_CANONICAL_ORDER), not a lowercase
// synthetic stand-in. These must resolve to kind:'region' regardless of
// what `ns.regionKeys` the caller supplies — including a genuinely EMPTY
// namespace, reproducing the exact failure mode this fix closes: a city
// whose region-summary fetch has not (yet, or ever) succeeded must still
// recognize a deep link carrying a real backend region_key.
describe('resolveScope — canonical region keys (Issue #1910 review fix)', () => {
  const emptyNs: ScopeNamespaces = {
    regionKeys: new Set(),
    groupSlugs: new Set(),
  };

  it.each(CANONICAL_REGION_KEYS)('classifies real backend region_key "%s" as kind:region even with an EMPTY ns.regionKeys', (key) => {
    expect(resolveScope(key, emptyNs)).toEqual({ kind: 'region', regionKey: key });
  });

  it('a canonical region key is NOT shadowed by a colliding groupSlugs entry (region-first order)', () => {
    const collidingNs: ScopeNamespaces = {
      regionKeys: new Set(),
      groupSlugs: new Set(['CENTRAL']),
    };
    expect(resolveScope('CENTRAL', collidingNs)).toEqual({ kind: 'region', regionKey: 'CENTRAL' });
  });

  it('a non-canonical, non-aliased value with an empty ns.regionKeys still falls through to kind:none', () => {
    expect(resolveScope('not-a-real-region', emptyNs)).toEqual({ kind: 'none' });
  });
});

// Issue #1910 (PR2 review fix) — legacy human-readable aliases resolve to
// their REAL canonical backend region_key, never to the raw alias string —
// downstream `region_key === resolved.regionKey` comparisons (the
// region-scoped projection fetch, map markers, camera bounds) all compare
// against the real key, so a caller that got back the raw alias string
// instead would silently match nothing.
describe('resolveScope — legacy region-name aliases (Issue #1910 review fix)', () => {
  const emptyNs: ScopeNamespaces = {
    regionKeys: new Set(),
    groupSlugs: new Set(),
  };

  it.each([
    ['north', 'N'],
    ['east', 'E'],
    ['south', 'S'],
    ['west', 'W'],
    ['central', 'CENTRAL'],
    ['northeast', 'NE'],
    ['southeast', 'SE'],
    ['southwest', 'SW'],
    ['northwest', 'NW'],
  ])('resolves legacy alias "%s" to canonical region_key "%s", even with an EMPTY ns.regionKeys', (alias, canonical) => {
    expect(resolveScope(alias, emptyNs)).toEqual({ kind: 'region', regionKey: canonical });
  });

  it('alias matching is case-insensitive on the raw value ("North"/"NORTH" both resolve)', () => {
    expect(resolveScope('North', emptyNs)).toEqual({ kind: 'region', regionKey: 'N' });
    expect(resolveScope('NORTH', emptyNs)).toEqual({ kind: 'region', regionKey: 'N' });
  });

  it('an alias never shadows an exact canonical/region-namespace match — a literal "N" always wins as itself', () => {
    // Not aliasable — 'N' IS already the canonical key, matched by the
    // CANONICAL_REGION_KEY_SET check before REGION_KEY_ALIASES is consulted.
    expect(resolveScope('N', emptyNs)).toEqual({ kind: 'region', regionKey: 'N' });
  });
});
