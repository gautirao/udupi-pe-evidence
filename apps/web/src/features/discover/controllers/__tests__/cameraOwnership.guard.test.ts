import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2142 (correction pass) — single-owner guards for the two camera
 * invariants, made mechanical rather than review-dependent.
 *
 * These are STATIC source guards. They cannot prove runtime camera behaviour
 * (that is what e2e/discover/issue-1823-camera-fit-policy.spec.ts,
 * issue-2083-home-breadcrumb-back-camera-race.spec.ts and
 * useDiscoverCameraOrchestration.rootFit.test.tsx do). What they DO prove is
 * that those behavioural tests still have exactly one production owner to
 * point at — i.e. that nobody has re-introduced a second camera producer
 * outside useDiscoverCameraController.
 */

const SRC_ROOT = path.resolve(__dirname, '../../../..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

/** Production files only — test files legitimately import the hook to mock/exercise it. */
const PRODUCTION_FILES = ALL_SOURCE_FILES.filter(
  (f) => !/\.test\.tsx?$/.test(f) && !f.includes(`${path.sep}__tests__${path.sep}`),
);

describe('#1823/#2143 — useDiscoverCameraOrchestration has exactly one production importer', () => {
  it('only useDiscoverCameraController.ts imports the camera orchestration hook', () => {
    const importers = PRODUCTION_FILES.filter((file) => {
      if (file.endsWith(path.join('state', 'useDiscoverCameraOrchestration.ts'))) return false; // the module itself
      return /from '@\/features\/discover\/state\/useDiscoverCameraOrchestration'/.test(
        fs.readFileSync(file, 'utf-8'),
      );
    }).map((f) => path.relative(SRC_ROOT, f));

    // Type-only imports of the params/result types are allowed (they carry no
    // behaviour); a VALUE import of the hook is not.
    const valueImporters = importers.filter((rel) => {
      const source = fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8');
      return /import\s+\{[^}]*\buseDiscoverCameraOrchestration\b/.test(source);
    });

    expect(valueImporters).toEqual(['features/discover/controllers/useDiscoverCameraController.ts']);
  });
});

describe('presentation-only controllers must never produce camera movement', () => {
  const CAMERA_PRODUCERS = [
    /\bpublishCameraIntent\b/,
    /\bpublishClusterCameraIntent\b/,
    /\bpublishMarkerClusterCameraIntent\b/,
    /\bpublishRecenterCameraIntent\b/,
    /\bsetPanToArea\b/,
    /\buseDiscoverCameraOrchestration\b/,
  ];

  it('useDiscoverInteractionController.ts references no camera producer', () => {
    const source = fs.readFileSync(
      path.join(SRC_ROOT, 'features/discover/controllers/useDiscoverInteractionController.ts'),
      'utf-8',
    );
    // Strip the file's own doc comment, which names the producers it forbids.
    const body = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
    for (const producer of CAMERA_PRODUCERS) {
      expect(body).not.toMatch(producer);
    }
  });

  it('useDiscoverRegionGuideController.ts references no camera producer', () => {
    const source = fs.readFileSync(
      path.join(SRC_ROOT, 'features/discover/controllers/useDiscoverRegionGuideController.ts'),
      'utf-8',
    );
    const body = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
    for (const producer of CAMERA_PRODUCERS) {
      expect(body).not.toMatch(producer);
    }
  });

  it('useDiscoverMapLayerController.ts references no camera producer', () => {
    const source = fs.readFileSync(
      path.join(SRC_ROOT, 'features/discover/controllers/useDiscoverMapLayerController.ts'),
      'utf-8',
    );
    const body = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
    for (const producer of CAMERA_PRODUCERS) {
      expect(body).not.toMatch(producer);
    }
  });
});
