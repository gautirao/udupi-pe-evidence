/**
 * markerTokens.ts <-> design-system parity — Issue #2088 (commit 1/7, AC8).
 *
 * Each constant in `markerTokens.ts` is asserted equal to the value PARSED
 * (never retyped by hand) from `docs/design/retrends-design-system/tokens/
 * *.css` at test-run time, so this test goes red the moment the design
 * system moves rather than silently drifting from it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tokens from '../markerTokens';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_DIR = path.resolve(HERE, '../../../../docs/design/retrends-design-system/tokens');

function read(file: string): string {
  return fs.readFileSync(path.join(TOKENS_DIR, file), 'utf8');
}

/** Parses `--name: value;` out of a `:root { ... }` CSS block. Trims trailing comments. */
function parseCssVar(source: string, name: string): string {
  const re = new RegExp(`--${name}\\s*:\\s*([^;]+);`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`--${name} not found while parsing design tokens`);
  }
  return match[1].trim();
}

describe('markerTokens.ts values are parsed, not retyped, from the design system', () => {
  const colorsCss = read('colors.css');
  const elevationCss = read('elevation.css');
  const spacingCss = read('spacing.css');
  const typographyCss = read('typography.css');

  it('colors', () => {
    expect(tokens.NAVY_900).toBe(parseCssVar(colorsCss, 'navy-900'));
    expect(tokens.NAVY_800).toBe(parseCssVar(colorsCss, 'navy-800'));
    expect(tokens.NAVY_700).toBe(parseCssVar(colorsCss, 'navy-700'));
    expect(tokens.PAPER).toBe(parseCssVar(colorsCss, 'paper'));
    expect(tokens.COPPER_500).toBe(parseCssVar(colorsCss, 'copper-500'));
    expect(tokens.COPPER_600).toBe(parseCssVar(colorsCss, 'copper-600'));
    expect(tokens.COPPER_100).toBe(parseCssVar(colorsCss, 'copper-100'));
    expect(tokens.EVERGREEN_600).toBe(parseCssVar(colorsCss, 'evergreen-600'));
    expect(tokens.GREY_900).toBe(parseCssVar(colorsCss, 'grey-900'));
    expect(tokens.GREY_700).toBe(parseCssVar(colorsCss, 'grey-700'));
    expect(tokens.GREY_500).toBe(parseCssVar(colorsCss, 'grey-500'));
    // --border is not a hex primitive — parsed and compared as the literal
    // rgba() string, same discipline as every other token here.
    expect(tokens.BORDER).toBe(parseCssVar(colorsCss, 'border'));
  });

  it('plum (school-journey accent) — not in colors.css\'s default palette, pinned to the literal AreaMarkerLayer.tsx already ships (C_PLUM/plum-100 have no --plum-* token yet)', () => {
    // No --plum-600/--plum-100 custom property exists in colors.css today, so
    // this pair cannot be parsed from the design system. Recorded here as a
    // literal, KNOWN GAP — do not silently invent a --plum-* token to close
    // this out; that is a design-system change, out of this issue's scope.
    expect(tokens.PLUM_600).toBe('#5E5286');
    expect(tokens.PLUM_100).toBe('#DED7EC');
  });

  it('radii', () => {
    expect(tokens.RADIUS_LG).toBe(parseCssVar(spacingCss, 'radius-lg'));
    expect(tokens.RADIUS_FULL).toBe(parseCssVar(spacingCss, 'radius-full'));
  });

  it('shadows', () => {
    expect(tokens.SHADOW_MD).toBe(parseCssVar(elevationCss, 'shadow-md'));
    expect(tokens.SHADOW_LG).toBe(parseCssVar(elevationCss, 'shadow-lg'));
  });

  it('font stacks', () => {
    expect(tokens.FONT_SANS).toBe(parseCssVar(typographyCss, 'font-sans'));
    expect(tokens.FONT_MONO).toBe(parseCssVar(typographyCss, 'font-mono'));
  });
});
