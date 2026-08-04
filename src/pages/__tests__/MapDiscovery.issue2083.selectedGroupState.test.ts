/**
 * Issue #2083 cycle 4 — code-review BLOCKING fix regression test.
 *
 * `isSelectedGroupState` (MapDiscovery.tsx) gates the group-overview map
 * chrome (city switcher hidden, "verified properties in {group}" pill,
 * Areas legend). It must be FALSE once the user has drilled down to a
 * specific area, even when a group is still present in the URL (the normal
 * breadcrumb/back shape).
 *
 * The bug (4th recurrence of the "bare legacy `selectedArea` vs bridged
 * `effectiveSelectedArea`" class): the guard read the bare legacy value,
 * which is null under a pure canonical node journey
 * (`?journey=area-first&groupId=<group>&node=<AREA leaf in that group>`,
 * no legacy areaKey — the node journey never sets it). That URL shape is
 * concretely reachable:
 *   - `resolvedPanelContent === 'area-groups-landing'` whenever
 *     `journey === 'area-first'` and the legacy `areaKey` is absent
 *     (discoverPanelState.ts:167) — exactly where a pure node journey lives.
 *   - `focusedGroup` resolves independently of `node` (node/groupId are
 *     documented, test-proven independent URL axes — navigation.test.ts:72-78,
 *     AC1.4 asserts `node=...&groupId=...` co-exist and both resolve).
 * So a user who drilled into a specific area via the node journey, with a
 * group still in the URL, wrongly got group-overview chrome instead of the
 * area-selected UI.
 *
 * MapDiscovery cannot be mounted in JSDOM (Leaflet/QueryClient/Router/Auth —
 * see MapDiscovery.issue2083.badgeBridge.test.ts for the same constraint), so
 * this exercises the REAL production predicate via the exported, pure
 * `resolveIsSelectedGroupState` (MapDiscovery.tsx) at its REAL call site
 * formula, not a hand-derived re-implementation.
 */
import { describe, it, expect } from 'vitest';
import { resolveIsSelectedGroupState, resolveEffectiveSelectedArea } from '@/pages/MapDiscovery';
import type { AreaGroup } from '@/hooks/useAreaGroups';

describe('#2083 cycle 4 — isSelectedGroupState must not fire once a node-journey area is resolved', () => {
  const focusedGroup: AreaGroup = {
    id: 'manipal-group',
    name: 'Manipal Belt',
    subtitle: null,
    region_label: null,
    school_count: 0,
    area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Tiger Circle'],
  };

  const nodeAreaPoint = {
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.35,
    geo_center_lon: 74.79,
    bbox: null,
    listingCount: 12,
  };

  it('reachable sequence: journey=area-first + groupId set + node= resolved to an AREA leaf + no areaKey -> isSelectedGroupState is false', () => {
    // Reproduces the exact reachable URL shape:
    // ?city=bangalore&journey=area-first&groupId=<group>&node=<AREA leaf>
    // Legacy areaKey-driven selectedArea is null (node journey never sets it);
    // nodeAreaPoint is populated by the resolved AREA leaf.
    const legacySelectedArea = null;
    const effectiveSelectedArea = resolveEffectiveSelectedArea(legacySelectedArea, nodeAreaPoint);
    expect(effectiveSelectedArea).toBe(nodeAreaPoint); // sanity: bridge resolved

    const isSelectedGroupState = resolveIsSelectedGroupState(
      'area-groups-landing',
      focusedGroup,
      effectiveSelectedArea,
    );
    expect(isSelectedGroupState).toBe(false);
  });

  it('negative control: feeding the UNBRIDGED (bare legacy) selectedArea reproduces the reported bug — wrongly true', () => {
    // This is exactly the PRE-FIX call shape — proves the bug was real.
    const legacySelectedArea = null; // node journey never sets it
    const isSelectedGroupState = resolveIsSelectedGroupState(
      'area-groups-landing',
      focusedGroup,
      legacySelectedArea, // bare, unbridged
    );
    expect(isSelectedGroupState).toBe(true); // the bug: wrongly shows group chrome
  });

  it('group-overview state (no area drilled into yet): isSelectedGroupState is true', () => {
    const isSelectedGroupState = resolveIsSelectedGroupState(
      'area-groups-landing',
      focusedGroup,
      null,
    );
    expect(isSelectedGroupState).toBe(true);
  });

  it('no focused group: isSelectedGroupState is false regardless of panel content', () => {
    const isSelectedGroupState = resolveIsSelectedGroupState(
      'area-groups-landing',
      null,
      null,
    );
    expect(isSelectedGroupState).toBe(false);
  });

  it('legacy areaKey journey (selectedArea non-null): isSelectedGroupState is false, same as the node-journey case', () => {
    const legacyArea = {
      areaKey: 'IN|KA|Udupi|Manipal',
      areaLabel: 'Manipal',
      geo_center_lat: 13.35,
      geo_center_lon: 74.79,
      bbox: null,
      listingCount: 12,
    };
    const effectiveSelectedArea = resolveEffectiveSelectedArea(legacyArea, null);
    const isSelectedGroupState = resolveIsSelectedGroupState(
      'area-groups-landing',
      focusedGroup,
      effectiveSelectedArea,
    );
    expect(isSelectedGroupState).toBe(false);
  });
});
