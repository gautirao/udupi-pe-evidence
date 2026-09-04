import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Issue #2419 (PR-2) — the draw entry must reach BOTH committed-AREA_SET
 * panel branches.
 *
 * It previously lived inline in the multi-area header only, so a SINGLE
 * committed area — much the more common state, and the one the #2016 contract
 * spec reaches — had no draw entry at all. That was invisible because the
 * multi-area header simply happened to be where PR-1 inherited the disabled
 * placeholder.
 *
 * A source-text guard, like `authThreading.guard.test.ts`, because this is a
 * fact about WIRING between two files: rendering `AreaSelectedPanel` would
 * drag in the entire discover context tree to assert one placement, and the
 * component's own behaviour is already covered by
 * `AreaSetSelectedExtras.drawEntry.test.tsx`.
 *
 * Comments are stripped before matching so prose naming the component can
 * never satisfy a check.
 */

const PANEL = resolve(__dirname, '../AreaSelectedPanel.tsx');

const source = readFileSync(PANEL, 'utf-8')
  .replace(/\/\*\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('#2419 — draw entry placement', () => {
  it('renders the shared entry component rather than an inline copy', () => {
    expect(source).toMatch(/<DrawSearchAreaEntry/);
    // An inline EPGhost carrying the entry's testid would mean a second copy
    // of the eligibility call and the reveal-then-arm ordering, free to drift.
    expect(source).not.toMatch(/testId="area-set-draw-area"/);
  });

  it('wires it to the shell action in the single-area branch', () => {
    expect(source).toMatch(/onDrawSearchArea=\{shell\.startDrawSearchArea\}/);
  });

  // VIEWPORT scope shares the single-area branch and is not a drawable state,
  // so the entry has to be gated there rather than simply present.
  it('gates the single-area entry out of VIEWPORT scope', () => {
    const singleAreaRegion = source.slice(source.indexOf('area-single-action-row'));
    expect(source).toContain('area-single-action-row');
    expect(singleAreaRegion.slice(0, 400)).toMatch(/DrawSearchAreaEntry/);
    expect(source).toMatch(/!isViewportScope && \(/);
  });
});
