/**
 * Issue #2296 (PR #2381 third review) — the reviewer's core finding was that
 * `.agri-destination-marker-*` (src/index.css) hardcoded a raw palette
 * (#15803d/#ffffff/#14532d + assorted rgba) instead of reusing this app's
 * existing ReTrends design tokens (--evergreen/--evergreen-foreground/
 * --evergreen-tint/--card/--foreground), which are already defined in :root
 * and already consumed elsewhere (JourneySwitcher.tsx, PropertyCard.tsx,
 * TrustStrip.tsx all use hsl(var(--evergreen))).
 *
 * This test reads the real src/index.css from disk and asserts the
 * `.agri-destination-marker-*` rules reference those existing tokens, and
 * do NOT reintroduce a second hardcoded agri palette. It intentionally does
 * NOT forbid rgba(...) outright — this codebase has no separate elevation/
 * shadow CSS variable, so the neutral rgba(17,24,39,alpha) drop-shadow every
 * other marker in this file already uses (.agri-cluster,
 * .custom-marker-cluster-cap, etc.) is the established convention for
 * elevation here, not a design-token violation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = readFileSync(path.resolve(HERE, '../../../index.css'), 'utf-8');

function extractRule(selector: string): string {
  const start = INDEX_CSS.indexOf(`${selector} {`);
  expect(start, `expected to find "${selector} {" in src/index.css`).toBeGreaterThan(-1);
  const end = INDEX_CSS.indexOf('}', start);
  return INDEX_CSS.slice(start, end + 1);
}

describe('agri destination marker — design-token reuse (Issue #2296 PR #2381 third review)', () => {
  it('.agri-destination-marker-badge reuses --evergreen / --evergreen-foreground / --card, not a hardcoded hex palette', () => {
    const rule = extractRule('.agri-destination-marker-badge');
    expect(rule).toContain('hsl(var(--evergreen))');
    expect(rule).toContain('hsl(var(--evergreen-foreground))');
    expect(rule).toContain('hsl(var(--card))');
    expect(rule).not.toMatch(/#15803d/i);
    expect(rule).not.toMatch(/#ffffff/i);
  });

  it('.agri-destination-marker-badge--selected reuses --evergreen via the hsl(var(--x) / alpha) convention already used elsewhere in this file (e.g. --copper)', () => {
    const rule = extractRule('.agri-destination-marker-badge--selected');
    expect(rule).toContain('hsl(var(--evergreen) / 0.28)');
    expect(rule).not.toMatch(/rgba\(21,\s*128,\s*61/i); // the old hardcoded green-tinted ring
  });

  it('.agri-destination-marker-name reuses --card / --foreground / --evergreen-tint, not a hardcoded hex palette', () => {
    const rule = extractRule('.agri-destination-marker-name');
    expect(rule).toContain('hsl(var(--card))');
    expect(rule).toContain('hsl(var(--foreground))');
    expect(rule).toContain('hsl(var(--evergreen-tint))');
    expect(rule).not.toMatch(/#14532d/i);
    expect(rule).not.toMatch(/#ffffff/i);
  });

  it('--evergreen itself resolves to the approved evergreen family (#1F7A5C), not the generic success-green this used before', () => {
    // Sanity: confirm the token this rule now points at is genuinely the
    // ReTrends evergreen (#1F7A5C, documented inline in :root), not
    // re-defined to secretly still be #15803d.
    const rootBlockStart = INDEX_CSS.indexOf(':root {');
    const evergreenDecl = INDEX_CSS.slice(rootBlockStart, rootBlockStart + 6000);
    expect(evergreenDecl).toMatch(/--evergreen:\s*160 60% 30%/); // #1F7A5C in HSL
    expect(evergreenDecl).toMatch(/#1F7A5C/i);
  });
});
