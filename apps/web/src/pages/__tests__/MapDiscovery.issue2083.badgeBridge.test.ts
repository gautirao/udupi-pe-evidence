/**
 * Issue #2083 RC_B / AC6 — the map badge's `deriveDiscoverBadge`/
 * `formatDiscoverBadgeCopy` call sites must read the BRIDGED area
 * (`effectiveSelectedArea`, MapDiscovery.tsx:700), never the bare legacy
 * `selectedArea` — which is always null under the canonical `node=` journey
 * (only the legacy `areaKey` path ever sets it).
 *
 * MapDiscovery cannot be mounted in JSDOM (Leaflet/QueryClient/Router/Auth —
 * see the sibling `#1670 trendsHref` contract test in `MapDiscovery.test.tsx`
 * for the same constraint). Cycle-2 code review (Finding 1) flagged that the
 * original version of this file hand-wrote `selectedArea ?? nodeAreaPoint`
 * instead of importing the real bridge expression — meaning a revert of the
 * one-line fix at MapDiscovery.tsx's bridge site would NOT fail this suite.
 * Fixed by extracting the bridge into an exported, pure
 * `resolveEffectiveSelectedArea` that MapDiscovery.tsx now calls at its
 * bridge site, and importing THAT function here instead of re-deriving the
 * formula. This proves the FORMULA and its consumption by the real
 * `deriveDiscoverBadge`/`formatDiscoverBadgeCopy` functions against a
 * node-journey fixture: `selectedArea` null, `nodeAreaPoint` populated.
 *
 * Issue #2142 Commit 2 — import path repointed to
 * `selectors/effectiveArea.ts`, where this function now lives (moved
 * unchanged out of MapDiscovery.tsx). No assertion changes.
 */
import { describe, it, expect } from 'vitest';
import { deriveDiscoverBadge, formatDiscoverBadgeCopy } from '@/features/discover/presentation/discoverBadge';
import { resolveEffectiveSelectedArea } from '@/features/discover/selectors/effectiveArea';
import { CITY_CONFIG } from '@/lib/localityUtils';

describe('#2083 RC_B — badge reads the node-bridged area, not the bare legacy selectedArea', () => {
  const selectedArea = null; // node journey never sets the legacy areaKey-driven value
  const nodeAreaPoint = {
    areaKey: 'IN|KA|Bengaluru|Kambipura',
    areaLabel: 'Kambipura',
    geo_center_lat: 12.9,
    geo_center_lon: 77.4,
    bbox: null,
    listingCount: 9,
  };
  const city = 'bangalore';

  it('AC6: effectiveSelectedArea bridge — feeding the RAW (unbridged) selectedArea into deriveDiscoverBadge falls through to the city total (reproduces the reported bug)', () => {
    // This is exactly the PRE-FIX call shape (`selectedArea` bare) — proves
    // the bug was real, not merely a label issue.
    const badge = deriveDiscoverBadge({
      selectedArea, // bare, unbridged — null under the node journey
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 1737,
      areaListings: [],
    });
    expect(badge.count).toBe(1737); // city-wide, NOT the area's 9
  });

  it('AC6: resolveEffectiveSelectedArea (the REAL production bridge MapDiscovery.tsx uses) resolves the node journey to the AREA fixture, not null', () => {
    // Calls the actual exported function MapDiscovery.tsx:700 calls — a
    // revert of that call site (back to a bare `selectedArea`) would make
    // THIS assertion (and every assertion below that depends on it) fail.
    const effectiveSelectedArea = resolveEffectiveSelectedArea(selectedArea, nodeAreaPoint);
    expect(effectiveSelectedArea).toBe(nodeAreaPoint);
  });

  it('AC6: feeding the production-bridged area into deriveDiscoverBadge yields the AREA count, not cityTotal', () => {
    const effectiveSelectedArea = resolveEffectiveSelectedArea(selectedArea, nodeAreaPoint);
    const badge = deriveDiscoverBadge({
      selectedArea: effectiveSelectedArea,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 1737,
      areaListings: [],
    });
    expect(badge.count).toBe(9);
    expect(badge.state).toBe('ok');
  });

  it('AC6: the copy contract — bridged scopeLabel reads the area name, never falls back to the city label', () => {
    const effectiveSelectedArea = resolveEffectiveSelectedArea(selectedArea, nodeAreaPoint);
    const badge = deriveDiscoverBadge({
      selectedArea: effectiveSelectedArea,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 1737,
      areaListings: [],
    });
    // Reproduces the exact MapDiscovery.tsx fallbackBadgeCopy expression,
    // post-fix (effectiveSelectedArea, not the bare selectedArea).
    const copy = formatDiscoverBadgeCopy(badge, {
      scopeLabel:
        effectiveSelectedArea?.areaLabel ?? (CITY_CONFIG[city]?.label ?? city),
      noun: effectiveSelectedArea ? 'homes' : 'properties',
      searchQuery: undefined,
    });
    expect(copy).toContain('Kambipura');
    expect(copy).not.toContain('Bangalore');
    expect(copy).toContain('9');
  });

  it('AC6 (negative control): the UNBRIDGED expression reproduces the reported "1,737 properties in Bangalore" copy for a 9-listing area', () => {
    // This is the exact PRE-FIX bug: with the bare (unbridged) selectedArea,
    // both the count AND the scope label silently fall back to the city.
    const badge = deriveDiscoverBadge({
      selectedArea, // bare — null
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 1737,
      areaListings: [],
    });
    // `selectedArea` is null in this fixture, so the unbridged expression's
    // `scopeLabel` collapses straight to the city label — reproduced literally
    // (not via a cast) since `selectedArea` here really is `null`.
    const copy = formatDiscoverBadgeCopy(badge, {
      scopeLabel: CITY_CONFIG[city]?.label ?? city,
      noun: 'properties',
      searchQuery: undefined,
    });
    expect(copy).toContain('1,737');
    expect(copy).toContain('Bangalore');
  });

  it('resolveEffectiveSelectedArea: legacy areaKey journey (selectedArea non-null, nodeAreaPoint null) still resolves to selectedArea unchanged', () => {
    const legacySelectedArea = {
      areaKey: 'IN|KA|Bengaluru|Whitefield',
      areaLabel: 'Whitefield',
      geo_center_lat: 12.97,
      geo_center_lon: 77.75,
      bbox: null,
      listingCount: 42,
    };
    expect(resolveEffectiveSelectedArea(legacySelectedArea, null)).toBe(legacySelectedArea);
  });

  it('resolveEffectiveSelectedArea: neither source populated (cold load / group-level view) resolves to null', () => {
    expect(resolveEffectiveSelectedArea(null, null)).toBeNull();
  });
});
