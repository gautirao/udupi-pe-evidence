/**
 * Unit tests for `markerShellHtml` — Issue #2330 (Discover map marker
 * action-system reskin). This is a FUNCTION-LEVEL test against the shared
 * shell primitive in `markerPrimitives.ts` only — no Leaflet mock/harness
 * needed, because the builder has no React/Leaflet/DOM dependency of its
 * own. `markerShellHtml` REPLACES the pre-#2330 `visualClusterCardHtml`
 * (which only ever painted the "Zoom in" treatment); this file now exercises
 * all three action kinds (`explore`/`zoom`/`view-homes`) plus the journey
 * axis, proving the primitive is geometry/palette-only and orthogonal on
 * both inputs, per the approved plan.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/lib/security';
import { markerInteractiveAttrs, markerShellHtml, zoomGlyphSvg } from '../markerPrimitives';
import { NAVY_800, PAPER, COPPER_500, COPPER_600, COPPER_100, PLUM_600, PLUM_TINT, SHADOW_MD, SHADOW_LG, FONT_SANS } from '../markerTokens';

const FONT_SANS_ATTR = escapeHtml(FONT_SANS);
const WIDTH_PX = 172;

function baseOptions(overrides: Partial<Parameters<typeof markerShellHtml>[0]> = {}) {
  return {
    shellAttrs: markerInteractiveAttrs({
      testId: 'area-visual-cluster-marker',
      nodeKey: 'visual-cluster:koramangala|indiranagar',
      ariaLabel: 'Koramangala, Indiranagar, 2 areas with matches, 72 listings',
    }),
    titleAttr: '',
    actionKind: 'zoom' as const,
    journey: 'areas' as const,
    widthPx: WIDTH_PX,
    isSelected: false,
    journeyAttr: '',
    fontSansAttr: FONT_SANS_ATTR,
    identityHtml: '<span>Koramangala, Indiranagar</span>',
    footerIconHtml: zoomGlyphSvg(COPPER_600),
    footerLabelText: 'Zoom in',
    ...overrides,
  };
}

describe('markerShellHtml — structure', () => {
  it('emits one connected shell containing an identity section, a footer, and a tail, with overflow:hidden', () => {
    const html = markerShellHtml(baseOptions());

    expect(html).toContain('class="rc-shell"');
    expect(html).toMatch(/class="rc-shell"[^>]*overflow:hidden/);
    expect(html).toMatch(/class="rc-shell"[^>]*border-radius:12px/);
    expect(html).toContain('class="rc-body"');
    expect(html).toContain('class="rc-footer"');
    expect(html).toContain('class="rc-tail"');

    // Exactly one shared shell — the identity section and footer are both
    // nested inside the single `.rc-shell`, not two separate top-level cards.
    expect(html.match(/class="rc-shell"/g)).toHaveLength(1);
  });

  it('sizes the shell to the caller-supplied widthPx — never hardcodes a width (D1)', () => {
    const html = markerShellHtml(baseOptions({ widthPx: 172 }));
    expect(html).toMatch(/class="rc-shell"[^>]*width:172px/);

    const narrower = markerShellHtml(baseOptions({ widthPx: 150 }));
    expect(narrower).toMatch(/class="rc-shell"[^>]*width:150px/);
  });

  it('carries the identityHtml and footer icon/label/chevron exactly as supplied — never re-deriving content', () => {
    const html = markerShellHtml(
      baseOptions({ identityHtml: '<span data-marker="probe">probe-content</span>' }),
    );
    expect(html).toContain('<span data-marker="probe">probe-content</span>');
    expect(html).toContain('>Zoom in<');
    expect(html).toContain('&#8250;');
  });

  it('places exactly one data-marker-shell/data-action-kind/data-journey attribute set, colocated with shellAttrs on the OUTER wrapper (AC16) — never on .rc-shell', () => {
    const html = markerShellHtml(baseOptions({ journeyAttr: 'data-journey="schools"' }));
    expect(html).toMatch(
      /^<div data-testid="area-visual-cluster-marker"[^>]*data-action-kind="zoom" data-marker-shell="true" data-journey="schools" style="/,
    );
    expect(html.match(/data-marker-shell="true"/g)).toHaveLength(1);
    expect(html.match(/data-action-kind="zoom"/g)).toHaveLength(1);
    expect(html.match(/data-journey="schools"/g)).toHaveLength(1);
    expect(html).not.toMatch(/class="rc-shell"[^>]*data-journey="schools"/);
    expect(html).not.toMatch(/class="rc-shell"[^>]*data-marker-shell/);
  });
});

describe('markerShellHtml — accessibility', () => {
  it('carries exactly one role="button" and one tabindex="0"', () => {
    const html = markerShellHtml(baseOptions());
    expect(html.match(/role="button"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });

  it('exposes a single [role="button"][tabindex="0"] element that a caller can bind Enter/Space handling to', () => {
    const html = markerShellHtml(baseOptions());
    const container = document.createElement('div');
    container.innerHTML = html;
    const targets = container.querySelectorAll('[role="button"][tabindex="0"]');
    expect(targets).toHaveLength(1);
  });

  it('places the title attribute on the .rc-shell element when the caller supplies one', () => {
    const html = markerShellHtml(
      baseOptions({ titleAttr: 'title="Very Long Area Name One, Another Long Name Two"' }),
    );
    expect(html).toMatch(/class="rc-shell"[^>]*title="Very Long Area Name One, Another Long Name Two"/);
  });
});

describe('markerShellHtml — palette per (actionKind, journey), orthogonal', () => {
  it('explore/areas: ink navy body + white text, solid copper footer with white text', () => {
    const html = markerShellHtml(
      baseOptions({ actionKind: 'explore', journey: 'areas', footerLabelText: 'Explore' }),
    );
    expect(html).toMatch(/class="rc-body"[^>]*background:#1B2A45;color:#FFFFFF/i);
    expect(html).toMatch(/class="rc-footer"[^>]*background:#B05C3A/);
    expect(html).toContain('color:#FFFFFF;">Explore<');
  });

  it('explore/schools: ink navy body; footer flips to solid plum with white text', () => {
    const html = markerShellHtml(baseOptions({ actionKind: 'explore', journey: 'schools' }));
    expect(html).toMatch(/class="rc-body"[^>]*background:#1B2A45;color:#FFFFFF/i);
    expect(html).toMatch(/class="rc-footer"[^>]*background:#5E5286/);
  });

  it('zoom/areas: copper-100 light body, navy text; WHITE footer, copper-600 text/icon; copper-500 border/tail', () => {
    const html = markerShellHtml(baseOptions({ actionKind: 'zoom', journey: 'areas' }));
    expect(html).toMatch(new RegExp(`class="rc-body"[^>]*background:${COPPER_100};color:${NAVY_800}`));
    expect(html).toMatch(/class="rc-footer"[^>]*background:#FFFFFF/);
    expect(html).toContain(`border:1.5px solid ${COPPER_500}`);
    expect(html).toContain(`border-top:7px solid ${COPPER_500}`);
    // Never the superseded pre-#2330 dark Option-B body.
    expect(html).not.toContain(`background:${NAVY_800};color:#fff`);
  });

  it('zoom/schools: plum-tint light body, navy text; WHITE footer, plum-600 border/tail — never reusing the residential copper tint', () => {
    const html = markerShellHtml(baseOptions({ actionKind: 'zoom', journey: 'schools' }));
    expect(html).toMatch(new RegExp(`class="rc-body"[^>]*background:${PLUM_TINT};color:${NAVY_800}`));
    expect(html).toContain(`border:1.5px solid ${PLUM_600}`);
    expect(html).toContain(`border-top:7px solid ${PLUM_600}`);
    expect(html).not.toContain(COPPER_100);
    expect(html).not.toContain(COPPER_500);
  });

  it('view-homes: white body + navy text, SOLID navy footer with white text — the inverse of explore', () => {
    const html = markerShellHtml(
      baseOptions({ actionKind: 'view-homes', journey: 'areas', footerLabelText: 'View homes' }),
    );
    expect(html).toMatch(new RegExp(`class="rc-body"[^>]*background:${PAPER};color:${NAVY_800}`));
    expect(html).toMatch(/class="rc-footer"[^>]*background:#1B2A45/);
    expect(html).toContain(`color:${PAPER};">View homes<`);
  });

  it('view-schools: white body + navy text, SOLID plum footer with white text', () => {
    const html = markerShellHtml(
      baseOptions({ actionKind: 'view-schools', journey: 'schools', footerLabelText: 'View schools' }),
    );
    expect(html).toMatch(new RegExp(`class="rc-body"[^>]*background:${PAPER};color:${NAVY_800}`));
    expect(html).toMatch(/class="rc-footer"[^>]*background:#5E5286/);
    expect(html).toContain(`color:${PAPER};">View schools<`);
  });
});

describe('markerShellHtml — selected state', () => {
  it('explore: selected renders persistent copper outline + shadow-lg', () => {
    const html = markerShellHtml(baseOptions({ actionKind: 'explore', journey: 'areas', isSelected: true }));
    expect(html).toContain('outline:2px solid #B05C3A;outline-offset:2px;');
    expect(html).toContain(`box-shadow:${SHADOW_LG}`);
    expect(html).toContain('border:1.5px solid #B05C3A');
  });

  it('explore: unselected has no outline, shadow-md, and dark navy border', () => {
    const html = markerShellHtml(baseOptions({ actionKind: 'explore', journey: 'areas', isSelected: false }));
    expect(html).not.toContain('outline:2px solid');
    expect(html).toContain(`box-shadow:${SHADOW_MD}`);
    expect(html).toContain('border:1.5px solid rgba(27,42,69,0.24)');
  });

  it('zoom: border is the SOLID accent regardless of selection; selected adds the accent outline + shadow-lg', () => {
    const resting = markerShellHtml(baseOptions({ actionKind: 'zoom', journey: 'areas', isSelected: false }));
    const selected = markerShellHtml(baseOptions({ actionKind: 'zoom', journey: 'areas', isSelected: true }));
    expect(resting).toContain(`border:1.5px solid ${COPPER_500}`);
    expect(selected).toContain(`border:1.5px solid ${COPPER_500}`);
    expect(selected).toContain(`outline:2px solid ${COPPER_500};outline-offset:2px;`);
    expect(resting).not.toContain('outline:2px solid');
    expect(resting).toContain(`box-shadow:${SHADOW_MD}`);
    expect(selected).toContain(`box-shadow:${SHADOW_LG}`);
  });

  it('view-homes: selected adds a persistent navy outline + shadow-lg, heavier border', () => {
    const html = markerShellHtml(
      baseOptions({ actionKind: 'view-homes', journey: 'areas', isSelected: true, footerLabelText: 'View homes' }),
    );
    expect(html).toContain(`outline:2px solid ${NAVY_800};outline-offset:2px;`);
    expect(html).toContain(`box-shadow:${SHADOW_LG}`);
    expect(html).toContain('border:1.5px solid rgba(27,42,69,0.5)');
  });
});
