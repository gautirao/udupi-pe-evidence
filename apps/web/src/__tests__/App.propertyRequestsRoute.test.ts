import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #1793 PR-C — source-text gates (same convention as App.lazyRoutes.test.ts; comments are
 * stripped before matching so a comment cannot satisfy a check about code).
 *
 *  - the admin route is lazy, admin-protected and rendered ONLY behind the feature flag
 *  - agri journeys never reach the request card
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(path.join(__dirname, rel), 'utf-8'));
const APP = read('../App.tsx');

describe('App — /admin/property-requests route (#1793 PR-C)', () => {
  it('is a lazy import', () => {
    expect(APP).toMatch(
      /const\s+PropertyRequests\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/pages\/admin\/PropertyRequests["']\s*\)\s*\)/,
    );
    expect(APP).not.toMatch(/^\s*import\s+PropertyRequests\s+from/m);
  });

  it('is wrapped in ProtectedRoute requireAdmin and rendered only when the flag helper is true', () => {
    const route = APP.match(
      /\{\s*isPropertyRequestsEnabled\(\)\s*&&\s*\(\s*<Route\s+path="\/admin\/property-requests"\s+element=\{\s*<ProtectedRoute requireAdmin>\s*<PropertyRequests\s*\/>\s*<\/ProtectedRoute>\s*\}\s*\/>\s*\)\s*\}/,
    );
    expect(route).not.toBeNull();
    // exactly one declaration of the path — no unguarded second copy
    expect(APP.split('path="/admin/property-requests"').length - 1).toBe(1);
  });
});

describe('agri journeys do not reach the request card (#1793 PR-C)', () => {
  const AGRI_PANELS = [
    '../components/discover/panels/AgriFiltersPanel.tsx',
    '../components/discover/panels/AgriGroupLocalityPanel.tsx',
    '../components/discover/panels/AgriGroupSelectedPanel.tsx',
    '../components/discover/panels/AgriListingPanel.tsx',
    '../components/discover/panels/AgriRegionalGroupsPanel.tsx',
    '../components/discover/panels/AgriGroupListingPeek.tsx',
  ];

  it.each(AGRI_PANELS)('%s imports neither the card nor the zero-state hosts that render it', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/RequestPropertyCard/);
    expect(src).not.toMatch(/ListingsBody/);
    expect(src).not.toMatch(/SchoolRadiusEmptyState/);
  });

  it('the card is imported only by the two intended hosts', () => {
    expect(read('../features/discover/area-selected/sections/ListingsBody.tsx')).toMatch(/RequestPropertyCard/);
    expect(read('../components/discover/panels/schools/radius/SchoolRadiusEmptyState.tsx')).toMatch(/RequestPropertyCard/);
    expect(read('../components/discover/MapEmptyGuidance.tsx')).not.toMatch(/RequestPropertyCard/);
  });
});
