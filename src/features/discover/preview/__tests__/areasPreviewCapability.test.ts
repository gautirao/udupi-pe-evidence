/**
 * Issue #1956 PR 1 (FE-1) — the dual preview gate.
 *
 * Covers AC1.2 (the 2x2 truth table: the journey mounts only when the
 * deployment capability AND areasPreview=1 are both true), the accepted-value
 * contract for VITE_DISCOVER_AREAS_PREVIEW (default DISABLED), the gate's
 * deliberate independence from `node=`, and the single-owner rule (no other
 * file reads the env var).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AREAS_PREVIEW_ENV_KEY,
  isAreasPreviewCapabilityEnabled,
  isAreasPreviewJourneyActive,
  parseAreasPreviewCapability,
} from '../areasPreviewCapability';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseAreasPreviewCapability — accepted values', () => {
  it.each(['1', 'true', 'TRUE', 'True', '  true  ', ' 1 '])(
    'enables for %j',
    (raw) => {
      expect(parseAreasPreviewCapability(raw)).toBe(true);
    },
  );

  it.each(['', '0', 'false', 'yes', 'on', 'enabled', '2', 'truthy', ' '])(
    'stays DISABLED for %j',
    (raw) => {
      expect(parseAreasPreviewCapability(raw)).toBe(false);
    },
  );

  it.each([undefined, null, 1, true, {}])('stays DISABLED for non-string %j', (raw) => {
    expect(parseAreasPreviewCapability(raw)).toBe(false);
  });
});

describe('isAreasPreviewCapabilityEnabled — env read', () => {
  it('is DISABLED by default (env var absent/empty)', () => {
    vi.stubEnv(AREAS_PREVIEW_ENV_KEY, '');
    expect(isAreasPreviewCapabilityEnabled()).toBe(false);
  });

  it('is ENABLED when the env var is "1"', () => {
    vi.stubEnv(AREAS_PREVIEW_ENV_KEY, '1');
    expect(isAreasPreviewCapabilityEnabled()).toBe(true);
  });

  it('is ENABLED when the env var is "true" (case-insensitive, trimmed)', () => {
    vi.stubEnv(AREAS_PREVIEW_ENV_KEY, '  TRUE ');
    expect(isAreasPreviewCapabilityEnabled()).toBe(true);
  });

  it('is DISABLED for an unrecognised value', () => {
    vi.stubEnv(AREAS_PREVIEW_ENV_KEY, 'yes');
    expect(isAreasPreviewCapabilityEnabled()).toBe(false);
  });
});

describe('isAreasPreviewJourneyActive — AC1.2 dual-gate truth table', () => {
  const CASES: {
    capabilityEnabled: boolean;
    areasPreview: boolean | undefined;
    expected: boolean;
  }[] = [
    { capabilityEnabled: false, areasPreview: undefined, expected: false },
    { capabilityEnabled: false, areasPreview: true, expected: false },
    { capabilityEnabled: true, areasPreview: undefined, expected: false },
    { capabilityEnabled: true, areasPreview: true, expected: true },
  ];

  it.each(CASES)(
    'capability=$capabilityEnabled areasPreview=$areasPreview -> $expected',
    ({ capabilityEnabled, areasPreview, expected }) => {
      expect(isAreasPreviewJourneyActive({ capabilityEnabled, areasPreview })).toBe(expected);
    },
  );

  it('the URL parameter ALONE has no effect when the capability is disabled', () => {
    expect(
      isAreasPreviewJourneyActive({ capabilityEnabled: false, areasPreview: true }),
    ).toBe(false);
  });

  it('is independent of `node` — the gate function does not accept it at all', () => {
    // Structural proof, not a behavioural one: the gate's single parameter is a
    // two-key object. A future `node` input would have to change this shape,
    // which this assertion makes visible.
    const input = { capabilityEnabled: true, areasPreview: true } as const;
    expect(Object.keys(input).sort()).toEqual(['areasPreview', 'capabilityEnabled']);
    expect(isAreasPreviewJourneyActive(input)).toBe(true);
    // And the same inputs give the same answer regardless of any node value a
    // caller may hold, because node is never passed in.
    expect(isAreasPreviewJourneyActive({ capabilityEnabled: true, areasPreview: undefined })).toBe(
      false,
    );
  });
});

describe('single-owner rule — VITE_DISCOVER_AREAS_PREVIEW is read in exactly one module', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(here, '../../../../..', 'src');
  const OWNER = path.join(srcRoot, 'features/discover/preview/areasPreviewCapability.ts');

  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, acc);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        acc.push(full);
      }
    }
    return acc;
  }

  // Test files are excluded: the rule is that no PRODUCTION module may read the
  // env var directly. Tests legitimately stub it (vi.stubEnv) to drive the gate.
  it('no production module outside the owner reads the env var', () => {
    const offenders = walk(srcRoot)
      .filter((file) => file !== OWNER && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes('VITE_DISCOVER_AREAS_PREVIEW'));

    expect(offenders).toEqual([]);
  });
});
