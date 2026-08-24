/**
 * Unit tests for `visualClusterCardHtml` — Issue #2305 STAGE 1 (zero-collision
 * precursor). This is a FUNCTION-LEVEL test against the new pure builder in
 * `markerPrimitives.ts` only — no Leaflet mock/harness needed, because the
 * builder has no React/Leaflet/DOM dependency of its own. Wiring this
 * function into `AreaMarkerLayer.tsx`'s `makeAreaVisualClusterCard` call site
 * is stage 2 (deferred until Issue #1943 merges); see
 * `.claude/handoffs/issue-2305/team-lead-plan-stage1.toml`.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/lib/security';
import { markerInteractiveAttrs, visualClusterCardHtml } from '../markerPrimitives';
import { NAVY_800, PAPER, COPPER_500, PLUM_600, SHADOW_LG, FONT_SANS, FONT_MONO } from '../markerTokens';

const FONT_SANS_ATTR = escapeHtml(FONT_SANS);
const FONT_MONO_ATTR = escapeHtml(FONT_MONO);
const WIDTH_PX = 172;

function baseOptions(overrides: Partial<Parameters<typeof visualClusterCardHtml>[0]> = {}) {
  return {
    shellAttrs: markerInteractiveAttrs({
      testId: 'area-visual-cluster-marker',
      nodeKey: 'visual-cluster:koramangala|indiranagar',
      ariaLabel: 'Koramangala, Indiranagar, 2 areas with matches, 72 listings',
    }),
    titleAttr: '',
    namesHtml: 'Koramangala, Indiranagar',
    heroNumberHtml: '72',
    heroUnitHtml: 'listings',
    pillHtml: '2 areas with matches',
    accent: COPPER_500,
    widthPx: WIDTH_PX,
    isFocusedSelected: false,
    journeyAttr: '',
    fontSansAttr: FONT_SANS_ATTR,
    fontMonoAttr: FONT_MONO_ATTR,
    ...overrides,
  };
}

describe('visualClusterCardHtml — structure', () => {
  it('emits one connected shell containing a navy section, a white footer, and a tail, with overflow:hidden', () => {
    const html = visualClusterCardHtml(baseOptions());

    expect(html).toContain('class="rc-shell"');
    expect(html).toMatch(/class="rc-shell"[^>]*overflow:hidden/);
    expect(html).toMatch(/class="rc-shell"[^>]*border-radius:12px/);
    expect(html).toContain(`box-shadow:${SHADOW_LG}`);
    expect(html).toContain(`background:${NAVY_800};color:#fff`);
    expect(html).toContain('class="rc-footer"');
    expect(html).toContain(`background:${PAPER}`);
    expect(html).toContain('class="rc-tail"');
    expect(html).toContain(`border-top:7px solid ${COPPER_500}`);

    // Exactly one shared shell — the navy section and footer are both nested
    // inside the single `.rc-shell`, not two separate top-level cards.
    expect(html.match(/class="rc-shell"/g)).toHaveLength(1);
  });

  it(`sizes the shell to widthPx and clamps names to widthPx-28`, () => {
    const html = visualClusterCardHtml(baseOptions({ widthPx: 172 }));
    expect(html).toMatch(/class="rc-shell"[^>]*width:172px/);
    expect(html).toContain('max-width:144px');
  });
});

describe('visualClusterCardHtml — copy', () => {
  it('renders the exact "Zoom in" footer copy with a chevron, never the retired "Tap to zoom"', () => {
    const html = visualClusterCardHtml(baseOptions());
    expect(html).toContain('>Zoom in<');
    expect(html).toContain('&#8250;');
    expect(html).not.toContain('Tap to zoom');
  });

  it('renders a plural hero unit for a count > 1', () => {
    const html = visualClusterCardHtml(baseOptions({ heroNumberHtml: '72', heroUnitHtml: 'listings' }));
    expect(html).toMatch(/>72<\/span>/);
    expect(html).toMatch(/\blistings\b/);
  });

  it('renders a singular hero unit for a count of 1, not matched by a "listings" substring check', () => {
    const html = visualClusterCardHtml(baseOptions({ heroNumberHtml: '1', heroUnitHtml: 'listing' }));
    expect(html).toMatch(/>1<\/span>/);
    expect(html).toMatch(/>listing<\/span>/);
    expect(html).not.toMatch(/>listings<\/span>/);
  });

  it('renders the zero-count guard phrase and never a bare mono "0"', () => {
    const html = visualClusterCardHtml(
      baseOptions({ heroNumberHtml: undefined, heroUnitHtml: undefined, zeroPhraseHtml: 'No listings yet' }),
    );
    expect(html).toContain('No listings yet');
    expect(html).not.toMatch(/>0</);
  });

  it('lets zeroPhraseHtml win even when heroNumberHtml/heroUnitHtml are also supplied, per the documented "Ignored when zeroPhraseHtml is set" contract', () => {
    const html = visualClusterCardHtml(
      baseOptions({ heroNumberHtml: '72', heroUnitHtml: 'listings', zeroPhraseHtml: 'No listings yet' }),
    );
    expect(html).toContain('No listings yet');
    // The number+unit hero row is absent entirely, not just visually superseded.
    expect(html).not.toMatch(/>72<\/span>/);
    expect(html).not.toMatch(/>listings<\/span>/);
  });

  it('renders the pill label verbatim, including the "+N" prefix form', () => {
    const plain = visualClusterCardHtml(baseOptions({ pillHtml: '2 areas with matches' }));
    expect(plain).toContain('>2 areas with matches<');

    const hidden = visualClusterCardHtml(baseOptions({ pillHtml: '+1 areas with matches' }));
    expect(hidden).toContain('>+1 areas with matches<');
  });
});

describe('visualClusterCardHtml — accessibility', () => {
  it('carries exactly one role="button" and one tabindex="0"', () => {
    const html = visualClusterCardHtml(baseOptions());
    expect(html.match(/role="button"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });

  it('places the full-names title attribute on the shell when truncation occurred', () => {
    const html = visualClusterCardHtml(
      baseOptions({
        namesHtml: 'Very Long Area Nam&hellip;, Another Long Name&hellip;',
        titleAttr: 'title="Very Long Area Name One, Another Long Name Two"',
      }),
    );
    expect(html).toMatch(/class="rc-shell"[^>]*title="Very Long Area Name One, Another Long Name Two"/);
  });

  // PR #2315 review fix — relocated from `.rc-shell` to the OUTER wrapper
  // (the same element `shellAttrs`/`data-testid` sit on). index.css's
  // hover/focus footer-tint rule for the schools journey is a COMPOUND
  // selector — `[data-testid="area-visual-cluster-marker"]
  // [data-journey="schools"]:hover .rc-footer` — requiring BOTH attributes
  // on the SAME element. With `journeyAttr` on `.rc-shell` (a different
  // element from `data-testid`), that selector could never match at all.
  it('places a non-empty journeyAttr on the OUTER wrapper (colocated with data-testid), verbatim, exactly once, and never on .rc-shell', () => {
    const html = visualClusterCardHtml(baseOptions({ journeyAttr: 'data-journey="schools"' }));
    // Outer wrapper: shellAttrs (data-testid="area-visual-cluster-marker")
    // then journeyAttr, immediately before the wrapper's own `style=` —
    // colocated on the SAME element index.css's compound selector targets.
    expect(html).toMatch(/^<div data-testid="area-visual-cluster-marker"[^>]*data-journey="schools" style="/);
    // Never on .rc-shell — the exact bug this relocation fixes.
    expect(html).not.toMatch(/class="rc-shell"[^>]*data-journey="schools"/);
    // Single source of truth — never emitted on BOTH elements either
    // (the other rejected fix; this guard is unchanged from before the
    // relocation and must still be meaningful and passing).
    expect(html.match(/data-journey="schools"/g)).toHaveLength(1);
  });
});

describe('visualClusterCardHtml — accent switching', () => {
  it('resolves the footer text/chevron/tail to the copper accent for the residential journey, shell stays navy', () => {
    const html = visualClusterCardHtml(baseOptions({ accent: COPPER_500 }));
    expect(html).toContain(`color:${COPPER_500};">Zoom in`);
    expect(html).toContain(`border-top:7px solid ${COPPER_500}`);
    expect(html).toContain(`background:${NAVY_800};color:#fff`);
  });

  it('carries the accent hex on the zoom-glyph SVG stroke', () => {
    const html = visualClusterCardHtml(baseOptions({ accent: COPPER_500 }));
    expect(html).toMatch(new RegExp(`<svg[^>]*stroke="${COPPER_500}"`));
  });

  it('resolves the footer text/chevron/tail to the plum accent for the schools journey, shell stays navy', () => {
    const html = visualClusterCardHtml(baseOptions({ accent: PLUM_600 }));
    expect(html).toContain(`color:${PLUM_600};">Zoom in`);
    expect(html).toContain(`border-top:7px solid ${PLUM_600}`);
    expect(html).toContain(`background:${NAVY_800};color:#fff`);
    expect(html).not.toContain(COPPER_500);
  });
});

describe('visualClusterCardHtml — selected state', () => {
  it('emits the double-ring box-shadow and the heavier border when isFocusedSelected is true', () => {
    const html = visualClusterCardHtml(
      baseOptions({
        isFocusedSelected: true,
        shellAttrs: markerInteractiveAttrs({
          testId: 'area-visual-cluster-marker',
          nodeKey: 'visual-cluster:koramangala|indiranagar',
          selected: true,
          ariaLabel: 'Koramangala, Indiranagar, 2 areas with matches, 72 listings',
        }),
      }),
    );
    expect(html).toContain(`box-shadow:0 0 0 2px ${PAPER}, 0 0 0 4px ${NAVY_800}, ${SHADOW_LG}`);
    expect(html).toContain('border:1.5px solid rgba(27,42,69,0.4)');
    expect(html).toContain('data-selected="true"');
  });

  it('emits neither the double ring nor the heavier border when isFocusedSelected is false', () => {
    const html = visualClusterCardHtml(baseOptions({ isFocusedSelected: false }));
    expect(html).not.toContain('rgba(27,42,69,0.4)');
    expect(html).toContain('border:1.5px solid rgba(27,42,69,0.24)');
    expect(html).toContain(`box-shadow:${SHADOW_LG};`);
  });

  it('pins the exact shellBorderColor value for the focused-selected branch (rgba(27,42,69,0.4), not merely present)', () => {
    const html = visualClusterCardHtml(baseOptions({ isFocusedSelected: true }));
    expect(html).toMatch(/border:1\.5px solid rgba\(27,42,69,0\.4\);/);
    // Assert the sibling branch's value is absent too, so emitting both borders fails here.
    expect(html).not.toMatch(/border:1\.5px solid rgba\(27,42,69,0\.24\);/);
  });

  it('pins the exact shellBorderColor value for the unfocused branch (rgba(27,42,69,0.24), not merely present)', () => {
    const html = visualClusterCardHtml(baseOptions({ isFocusedSelected: false }));
    expect(html).toMatch(/border:1\.5px solid rgba\(27,42,69,0\.24\);/);
    expect(html).not.toMatch(/border:1\.5px solid rgba\(27,42,69,0\.4\);/);
  });
});

describe('visualClusterCardHtml — keyboard target', () => {
  it('exposes a single [role="button"][tabindex="0"] element that a caller can bind Enter/Space handling to', () => {
    const html = visualClusterCardHtml(baseOptions());
    const container = document.createElement('div');
    container.innerHTML = html;
    const targets = container.querySelectorAll('[role="button"][tabindex="0"]');
    expect(targets).toHaveLength(1);
  });
});
