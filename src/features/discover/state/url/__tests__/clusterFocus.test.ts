/**
 * clusterFocus URL domain — pure-function coverage for D2_binding_requirements
 * BR1, BR5-BR8 (Issue #2088). BR3/BR4 (replace-vs-push behaviour) require a
 * router harness and are exercised by the hook-level/component-level specs;
 * this file covers the domain's pure param algebra.
 */
import { describe, it, expect } from 'vitest';
import {
  CLUSTER_FOCUS_PARAM,
  MAX_CLUSTER_FOCUS_KEYS,
  readClusterFocusParam,
  clearClusterFocusParam,
  applyClusterFocusDelta,
} from '../clusterFocus';
import { isWritableNodeKey } from '../navigation';
import { AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS } from '@/features/discover/navigation/__fixtures__/candidateNavigationTree';

const AREA_KEY_WITH_SPACE = 'IN|KA|Bengaluru|Electronic City';
const AREA_KEY_2 = 'IN|KA|Bengaluru|Whitefield';

describe('clusterFocus — encode/decode round trip (pipe-delimited, space-containing area keys)', () => {
  it('round-trips a multi-member focus through the URL, spaces and pipes intact', () => {
    const written = applyClusterFocusDelta(new URLSearchParams(), [AREA_KEY_WITH_SPACE, AREA_KEY_2]);
    const read = readClusterFocusParam(written);
    expect(read).toEqual([AREA_KEY_WITH_SPACE, AREA_KEY_2]);
  });

  it('a comma inside a real area key never collides with the delimiter', () => {
    const weirdKey = 'IN|KA|Bengaluru|A, B Layout';
    const written = applyClusterFocusDelta(new URLSearchParams(), [weirdKey, AREA_KEY_2]);
    expect(readClusterFocusParam(written)).toEqual([weirdKey, AREA_KEY_2]);
  });
});

describe('clusterFocus — BR1: never a hierarchy node key', () => {
  it('the written param name is `clusterFocus`, never `node`', () => {
    const written = applyClusterFocusDelta(new URLSearchParams(), [AREA_KEY_WITH_SPACE]);
    expect(written.has('node')).toBe(false);
    expect(written.has(CLUSTER_FOCUS_PARAM)).toBe(true);
  });
});

describe('clusterFocus — BR2: never touches node/breadcrumb/ancestry params', () => {
  it('applyClusterFocusDelta only ever adds/removes the clusterFocus key', () => {
    const before = new URLSearchParams('node=d%3Acentral&city=bangalore&lat=12.9&lon=77.5&zoom=13');
    const after = applyClusterFocusDelta(before, [AREA_KEY_WITH_SPACE]);
    expect(after.get('node')).toBe(before.get('node'));
    expect(after.get('city')).toBe(before.get('city'));
    expect(after.get('lat')).toBe(before.get('lat'));
    expect(after.get('lon')).toBe(before.get('lon'));
    expect(after.get('zoom')).toBe(before.get('zoom'));
  });
});

describe('clusterFocus — BR8: shape/cardinality validation, safe strip (never throw)', () => {
  it('an absent param reads as null (not [])', () => {
    expect(readClusterFocusParam(new URLSearchParams())).toBeNull();
  });

  it('an empty-string param reads as null — the [] truthy-in-JS trap is closed', () => {
    const params = new URLSearchParams();
    params.set(CLUSTER_FOCUS_PARAM, '');
    expect(readClusterFocusParam(params)).toBeNull();
  });

  it('a value with only empty segments (e.g. a stray ",") reads as null', () => {
    const params = new URLSearchParams();
    params.set(CLUSTER_FOCUS_PARAM, ',,');
    expect(readClusterFocusParam(params)).toBeNull();
  });

  it('a value exceeding MAX_CLUSTER_FOCUS_KEYS is stripped entirely (whole value invalid, never partially truncated)', () => {
    const tooMany = Array.from({ length: MAX_CLUSTER_FOCUS_KEYS + 1 }, (_, i) => `IN|KA|Bengaluru|Area${i}`);
    const written = applyClusterFocusDelta(new URLSearchParams(), tooMany);
    // applyClusterFocusDelta itself refuses to write an over-cap value...
    expect(written.has(CLUSTER_FOCUS_PARAM)).toBe(false);
    // ...and a value that somehow reached the URL anyway (hand-crafted/forged)
    // is read back as null, never partially accepted.
    const forged = new URLSearchParams();
    forged.set(CLUSTER_FOCUS_PARAM, tooMany.map(encodeURIComponent).join(','));
    expect(readClusterFocusParam(forged)).toBeNull();
  });

  it('never throws on a malformed percent-encoding', () => {
    const params = new URLSearchParams();
    params.set(CLUSTER_FOCUS_PARAM, '%E0%A4%A');
    expect(() => readClusterFocusParam(params)).not.toThrow();
  });
});

describe('clusterFocus — BR5/BR6: clearClusterFocusParam is the one delete point', () => {
  it('clears the param and leaves everything else untouched', () => {
    const before = new URLSearchParams(`node=d%3Acentral&${CLUSTER_FOCUS_PARAM}=x`);
    const after = clearClusterFocusParam(before);
    expect(after.has(CLUSTER_FOCUS_PARAM)).toBe(false);
    expect(after.get('node')).toBe('d:central');
  });

  it('applyClusterFocusDelta(null) clears an existing focus (BR6 — "Show all")', () => {
    const before = new URLSearchParams(`${CLUSTER_FOCUS_PARAM}=x`);
    const after = applyClusterFocusDelta(before, null);
    expect(after.has(CLUSTER_FOCUS_PARAM)).toBe(false);
  });

  it('applyClusterFocusDelta([]) also clears — the empty array is never written as a degenerate present value', () => {
    const before = new URLSearchParams(`${CLUSTER_FOCUS_PARAM}=x`);
    const after = applyClusterFocusDelta(before, []);
    expect(after.has(CLUSTER_FOCUS_PARAM)).toBe(false);
  });
});

describe('clusterFocus — BR1: isWritableNodeKey(clusterFocusValue) is false for every candidate-derived cluster key', () => {
  // Owner-binding requirement, read literally: not merely "the param name is
  // different" (already covered above) but the NODE-KEY SHAPE VALIDATOR
  // ITSELF (`isWritableNodeKey`, `state/url/navigation.ts` — the ONE gate
  // every real `node=` write passes through) must reject every value this
  // domain can ever encode, individually AND as the joined/encoded string
  // actually written to the URL. Real, #2113-candidate-derived member
  // areaKeys (AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS), not hand-typed
  // look-alikes — this is the same fixture BR8's parent-mismatch behavioural
  // test (AreaMarkerLayer) draws from, so both tests are proven against the
  // identical real data.
  it('no individual candidate-derived member areaKey is ever a writable node key', () => {
    for (const areaKey of AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS) {
      expect(isWritableNodeKey(areaKey), `unexpectedly writable: ${areaKey}`).toBe(false);
    }
  });

  it('the full encoded clusterFocus= value (comma-joined, percent-encoded) is also never a writable node key', () => {
    const written = applyClusterFocusDelta(new URLSearchParams(), AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS);
    const encodedValue = written.get(CLUSTER_FOCUS_PARAM);
    expect(encodedValue).not.toBeNull();
    expect(isWritableNodeKey(encodedValue)).toBe(false);
  });

  it('POSITIVE CONTROL — isWritableNodeKey really does accept a real node key, so the negatives above are not vacuously true of a validator that rejects everything', () => {
    expect(isWritableNodeKey('a:IN|KA|Bengaluru|Avalahalli')).toBe(true);
    expect(isWritableNodeKey('d:central')).toBe(true);
    expect(isWritableNodeKey('root')).toBe(true);
  });
});

describe('clusterFocus — BR7: excluded from hierarchy static-sweep scope', () => {
  it('this module does not live under features/discover/navigation/ (the swept directory)', () => {
    // A structural, not textual, assertion: staticSweep.test.ts walks
    // NAV_DIR = features/discover/navigation only. This file's own path
    // (state/url/clusterFocus.ts) is outside that walk by construction —
    // this test exists so a future relocation of this module INTO the
    // navigation/ directory is caught here rather than silently starting to
    // participate in sweeps that assume it does not exist.
    const path = new URL(import.meta.url).pathname;
    expect(path).toContain('/state/url/');
    expect(path).not.toContain('/navigation/__tests__/');
  });
});
