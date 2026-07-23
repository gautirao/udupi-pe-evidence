import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #1953, user step 9 — HARD ARCHITECTURAL GATE on route laziness.
 *
 * `ListingDetail` was the ONLY eager route reaching Leaflet, via two real runtime
 * component edges (AgriListingDetail -> ListingDetailBoundaryMap, and
 * ListingDetailMainContent -> PoiMiniMap). Eager, it put ~222 kB into the entry
 * chunk and pulled the map libraries into the eager graph on every page load,
 * including /discover in List view where the map is deliberately unmounted.
 *
 * This is a mechanical source-text gate, matching the existing convention in
 * DiscoverControlBar.facadeOnly.test.tsx, so the constraint cannot silently
 * regress in a future edit. It fails if ListingDetail becomes eager again.
 *
 * WHAT THIS DELIBERATELY DOES NOT ASSERT — read before adding to it.
 * It does NOT assert "no Leaflet in the initial production entry". That is
 * currently FALSE and accepted by product ruling: vite.config.ts groups
 * react-leaflet into vendor-react (the config comment warns that splitting it
 * causes a createContext init-order crash), react-leaflet imports leaflet, and
 * the entry must import vendor-react — so the chain
 *   entry -> vendor-react -> react-leaflet -> vendor-leaflet
 * exists purely through chunk assignment and survives removing every
 * application-source edge. AC12's primary assertion stays NOT_SATISFIED and is
 * deferred to a follow-up that must reproduce or explain the createContext crash
 * before changing the chunking. A test asserting the absence of Leaflet here
 * would fail today, and writing it as a skipped or inverted marker would just be
 * a red flag dressed as coverage.
 *
 * COMMENTS ARE STRIPPED BEFORE MATCHING. App.tsx's own comment explains the
 * eager/lazy history and contains the words this gate looks for; matching raw
 * source would let a comment satisfy — or break — a check about code. An earlier
 * tracer in this issue was corrupted in exactly that way.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_SOURCE = readFileSync(path.join(__dirname, '../App.tsx'), 'utf-8')
  // JSX comments FIRST — `{/* ... */}` — so the braces go too. Stripping block
  // comments first would eat the `/* ... */` interior and leave bare `{}`, which
  // made the JSX pass dead code when it ran second.
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('App — route laziness gate (#1953 step 9)', () => {
  it('imports ListingDetail lazily, not eagerly', () => {
    expect(APP_SOURCE).toMatch(
      /const\s+ListingDetail\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/pages\/ListingDetail["']\s*\)\s*\)/,
    );
  });

  it('has no static top-level import of ListingDetail', () => {
    // The failure mode this gate exists for: someone re-adds
    //   import ListingDetail from "./pages/ListingDetail";
    // which silently returns ~222 kB and the map libraries to the entry chunk.
    expect(APP_SOURCE).not.toMatch(
      /^\s*import\s+ListingDetail\s+from\s+["']\.\/pages\/ListingDetail["']/m,
    );
  });

  it('encloses the /listing/:id route between <Suspense> and </Suspense>', () => {
    // A lazy route with no boundary white-screens at runtime rather than at build
    // time, so the laziness assertions above are only safe alongside this one.
    //
    // Asserts CONTAINMENT by source order, not mere co-presence. An earlier version
    // checked only that `<Suspense` and `path="/listing/:id"` each appeared
    // somewhere, which would still pass if the route were moved OUTSIDE the
    // boundary — i.e. it could not fail for the reason its title claimed.
    const open = APP_SOURCE.indexOf('<Suspense');
    const route = APP_SOURCE.search(/path="\/listing\/:id"/);
    const close = APP_SOURCE.indexOf('</Suspense>');
    expect(open).toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(-1);
    expect(open).toBeLessThan(route);
    expect(route).toBeLessThan(close);
  });
});
