/**
 * Unit tests for the pure discoverUrlNormalize shim (Issue #1745 slice P0).
 *
 * Tests cover:
 *  - Journey short-name alias matrix (area/school/agri → *-first, canonical
 *    passthrough, invalid/unknown values left untouched)
 *  - Legacy group=DIR:BAND migration parity with useDiscoverUrlState's OD-1
 *    Option A effect (all 8 directions, band always dropped, no maxKm inference)
 *  - Malformed/unknown group fallbacks (never throw)
 *  - Repeated-param preservation (e.g. board=CBSE&board=ICSE)
 *  - Idempotency (normalizing already-canonical output is a no-op)
 *  - Non-mutation of the input URLSearchParams
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_DIRECTIONS,
  extractLegacyGroupDirection,
  mapJourneyAlias,
  normalizeDiscoverSearchParams,
} from '../discoverUrlNormalize';

function paramsOf(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('mapJourneyAlias', () => {
  it('maps "area" to "area-first"', () => {
    expect(mapJourneyAlias('area')).toBe('area-first');
  });

  it('maps "school" to "school-first"', () => {
    expect(mapJourneyAlias('school')).toBe('school-first');
  });

  it('maps "agri" to "agri-first"', () => {
    expect(mapJourneyAlias('agri')).toBe('agri-first');
  });

  it('passes through canonical long forms unchanged', () => {
    expect(mapJourneyAlias('area-first')).toBe('area-first');
    expect(mapJourneyAlias('school-first')).toBe('school-first');
    expect(mapJourneyAlias('agri-first')).toBe('agri-first');
  });

  it('passes through unknown/invalid values unchanged (never forces a valid journey)', () => {
    expect(mapJourneyAlias('unknown-mode')).toBe('unknown-mode');
    expect(mapJourneyAlias('')).toBe('');
  });

  it('is lowercase-exact only — mis-cased aliases are NOT matched', () => {
    expect(mapJourneyAlias('Area')).toBe('Area');
    expect(mapJourneyAlias('AREA')).toBe('AREA');
    expect(mapJourneyAlias('School')).toBe('School');
  });
});

describe('extractLegacyGroupDirection', () => {
  it('extracts the direction for all 8 valid directions with a band', () => {
    for (const dir of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
      expect(extractLegacyGroupDirection(`${dir}:10_25`)).toBe(dir);
    }
  });

  it('extracts the direction from a band-less group (no colon)', () => {
    expect(extractLegacyGroupDirection('NW')).toBe('NW');
  });

  it('extracts the direction even when the band is malformed (band is never validated)', () => {
    expect(extractLegacyGroupDirection('N:50_PLUS')).toBe('N');
    expect(extractLegacyGroupDirection('NW:')).toBe('NW');
  });

  it('returns null for an invalid direction', () => {
    expect(extractLegacyGroupDirection('INVALID:10_25')).toBeNull();
    expect(extractLegacyGroupDirection('NORTH:100')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractLegacyGroupDirection('')).toBeNull();
  });

  it('returns null for a colon-prefixed value with no direction', () => {
    expect(extractLegacyGroupDirection(':25')).toBeNull();
  });

  it('returns null for a no-colon non-direction string', () => {
    expect(extractLegacyGroupDirection('N10_25')).toBeNull();
  });
});

describe('normalizeDiscoverSearchParams — journey alias matrix', () => {
  it('resolves journey=area to region=area-first (full alias matrix)', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('journey=area'));
    expect(result.get('journey')).toBe('area-first');
  });

  it('resolves journey=school to school-first', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('journey=school'));
    expect(result.get('journey')).toBe('school-first');
  });

  it('resolves journey=agri to agri-first', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('journey=agri'));
    expect(result.get('journey')).toBe('agri-first');
  });

  it('passes canonical long forms through unchanged', () => {
    expect(normalizeDiscoverSearchParams(paramsOf('journey=area-first')).get('journey')).toBe(
      'area-first',
    );
    expect(normalizeDiscoverSearchParams(paramsOf('journey=school-first')).get('journey')).toBe(
      'school-first',
    );
    expect(normalizeDiscoverSearchParams(paramsOf('journey=agri-first')).get('journey')).toBe(
      'agri-first',
    );
  });

  it('does not force an invalid journey value to a valid one', () => {
    expect(normalizeDiscoverSearchParams(paramsOf('journey=unknown-mode')).get('journey')).toBe(
      'unknown-mode',
    );
    expect(normalizeDiscoverSearchParams(paramsOf('journey=')).get('journey')).toBe('');
  });

  it('leaves journey absent when not in the input', () => {
    expect(normalizeDiscoverSearchParams(paramsOf('city=udupi')).get('journey')).toBeNull();
  });
});

describe('normalizeDiscoverSearchParams — legacy group migration parity', () => {
  it('migrates all 8 directions from group=DIR:BAND to region=DIR (band dropped)', () => {
    for (const dir of VALID_DIRECTIONS) {
      const result = normalizeDiscoverSearchParams(paramsOf(`group=${dir}:10_25`));
      expect(result.get('region')).toBe(dir);
      expect(result.get('group')).toBeNull();
      // maxKm is NEVER inferred from the band (Option B remains forbidden)
      expect(result.get('maxKm')).toBeNull();
    }
  });

  it('does not infer maxKm from any band value', () => {
    for (const band of ['0_10', '10_25', '25_50', '50_up']) {
      const result = normalizeDiscoverSearchParams(paramsOf(`group=SE:${band}`));
      expect(result.get('region')).toBe('SE');
      expect(result.get('maxKm')).toBeNull();
    }
  });

  it('migrates a band-less group=DIR (no colon)', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('group=NW'));
    expect(result.get('region')).toBe('NW');
    expect(result.get('group')).toBeNull();
  });

  it('drops an empty group param — no region set, never throws', () => {
    expect(() => normalizeDiscoverSearchParams(paramsOf('group='))).not.toThrow();
    const result = normalizeDiscoverSearchParams(paramsOf('group='));
    expect(result.get('group')).toBeNull();
    expect(result.get('region')).toBeNull();
  });

  it('drops group=:25 (no direction before colon) — no region set', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('group=:25'));
    expect(result.get('group')).toBeNull();
    expect(result.get('region')).toBeNull();
  });

  it('drops group=INVALID:... (invalid direction) — no region set', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('group=INVALID:10_25'));
    expect(result.get('group')).toBeNull();
    expect(result.get('region')).toBeNull();
  });

  it('drops a no-colon non-direction group value — no region set', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('group=N10_25'));
    expect(result.get('group')).toBeNull();
    expect(result.get('region')).toBeNull();
  });

  it('leaves region/group absent when group is not in the input', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('city=udupi'));
    expect(result.get('group')).toBeNull();
    expect(result.get('region')).toBeNull();
  });
});

describe('normalizeDiscoverSearchParams — passthrough and structural guarantees', () => {
  it('preserves repeated params in order (e.g. board=CBSE&board=ICSE)', () => {
    const result = normalizeDiscoverSearchParams(paramsOf('board=CBSE&board=ICSE'));
    expect(result.getAll('board')).toEqual(['CBSE', 'ICSE']);
  });

  it('preserves all other params untouched', () => {
    const input = paramsOf(
      'city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&type=land,house&priceMin=1000000&q=beach',
    );
    const result = normalizeDiscoverSearchParams(input);
    expect(result.get('city')).toBe('udupi');
    expect(result.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
    expect(result.get('type')).toBe('land,house');
    expect(result.get('priceMin')).toBe('1000000');
    expect(result.get('q')).toBe('beach');
  });

  it('does not mutate the input URLSearchParams', () => {
    const input = paramsOf('group=N:10_25&journey=area');
    const inputSnapshot = input.toString();
    normalizeDiscoverSearchParams(input);
    expect(input.toString()).toBe(inputSnapshot);
  });

  it('returns a new URLSearchParams instance, not the same reference', () => {
    const input = paramsOf('city=udupi');
    const result = normalizeDiscoverSearchParams(input);
    expect(result).not.toBe(input);
  });

  it('is idempotent — normalizing already-canonical output is a no-op', () => {
    const input = paramsOf('city=udupi&journey=area&group=N:10_25&board=CBSE&board=ICSE');
    const once = normalizeDiscoverSearchParams(input);
    const twice = normalizeDiscoverSearchParams(once);
    expect(twice.toString()).toBe(once.toString());
  });

  it('is idempotent for a fully canonical URL with no legacy params', () => {
    const input = paramsOf('city=udupi&journey=school-first&region=NW&maxKm=25');
    const once = normalizeDiscoverSearchParams(input);
    const twice = normalizeDiscoverSearchParams(once);
    expect(twice.toString()).toBe(once.toString());
    expect(once.toString()).toBe(input.toString());
  });
});
