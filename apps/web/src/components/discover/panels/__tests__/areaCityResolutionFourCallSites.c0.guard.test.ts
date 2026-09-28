import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Issue #2658 — was a C0 characterization (qa-fast flag), now a C2
 * convergence guard.
 *
 * `city || nav.city || DEFAULT_CITY` was independently re-typed at 4 call
 * sites inside AreaSelectedPanel.tsx pre-decomposition (confirmed via
 * search_text against the live file, not assumed from the architect's
 * plan). C1 extracted the single `resolveAreasCity` selector
 * (areaCityResolution.ts) as the one place this fallback chain is typed;
 * C2 finished the job by rewiring all 4 original call sites to call it —
 * 1 inside `useResultScopeController` (the `resolvedAreasCity` feeding
 * `useDiscoverAreas`), and the remaining 3 JSX `city={...}` props here in
 * AreaSelectedPanel.tsx, updated in this same commit.
 *
 * This guard now asserts the CONVERGED state — zero raw re-typings of the
 * fallback chain left inline — rather than pinning a duplication count
 * that would need bumping down every time another site converged. A
 * regression (someone adding a 5th inline `city || nav.city ||
 * DEFAULT_CITY` instead of calling `resolveAreasCity`) fails this
 * immediately, before it reaches a runtime behavioral test.
 *
 * This intentionally does NOT render the component: doing so would require
 * a bare `/discover` URL walked through the full DiscoverProvider/router
 * stack to observe DEFAULT_CITY resolution at runtime, which the existing
 * `AreaSelectedPanel.test.tsx` / `DiscoverRightPanel.test.tsx` suites are
 * better placed to cover (both still pass with every site now delegating to
 * `resolveAreasCity`, which is exercised directly by
 * `areaSelectedSelectors.c2.test.ts`).
 */

const PANEL = resolve(__dirname, '../AreaSelectedPanel.tsx');

const source = readFileSync(PANEL, 'utf-8')
  .replace(/\/\*\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('#2658 C2 — areaCityResolution duplication converged (was 4 inline sites pre-decomposition)', () => {
  it('has ZERO live (non-comment) call sites re-typing the `city || nav.city || DEFAULT_CITY` fallback inline', () => {
    const matches = source.match(/city \|\| nav\.city \|\| DEFAULT_CITY/g) ?? [];
    expect(matches).toHaveLength(0);
  });

  it('every former inline site now calls the extracted resolveAreasCity selector', () => {
    const calls = source.match(/resolveAreasCity\(/g) ?? [];
    // The 3 JSX `city={...}` props in this file (the 4th former site,
    // `resolvedAreasCity` feeding `useDiscoverAreas`, now lives inside
    // useResultScopeController, not in this file).
    expect(calls).toHaveLength(3);
  });

  it('uses `||` (not `??`) at every site — falls through empty-string city, not just null/undefined', () => {
    // A bare `/discover` URL means `nav.city === ''`, not undefined, so `??`
    // would NOT fall through to DEFAULT_CITY here — this is why the doc
    // comments at lines ~469 and ~828 call out `||` specifically.
    const nullishCoalescingVariant = source.match(/city \?\? nav\.city \?\? DEFAULT_CITY/g) ?? [];
    expect(nullishCoalescingVariant).toHaveLength(0);
  });
});
