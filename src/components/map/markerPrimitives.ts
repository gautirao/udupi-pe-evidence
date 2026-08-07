/**
 * Shared HTML-fragment builders for the canonical-hierarchy divIcon markers —
 * Issue #2088 (commit 2/7).
 *
 * These three functions factor out the literal markup genuinely IDENTICAL
 * (or parameterizably identical) across the three mock-governed divIcon
 * builders that live in `AreaMarkerLayer.tsx`'s `AreaDestinationMarkerLayer`
 * export: `makeDestinationCard` (the stable DIRECTION/CLUSTER "hierarchy
 * control"), `makeAreaVisualClusterCard` (the dashed, presentation-only AREA
 * cluster chip), and `makeSingleAreaChildCard` (the canonical single-AREA
 * pin). A fourth mock-governed treatment — listing price pins / navy listing
 * clusters — lives in the residential marker layer inside `PropertyMap.tsx`,
 * which is OUT OF SCOPE for this issue (not in the approved edit boundary);
 * see the issue-2088 implementation report for that documented gap.
 *
 * This is a BEHAVIOUR-PRESERVING extraction: every helper below reproduces
 * the exact HTML string each builder already emitted before this commit, one
 * call site at a time, verified byte-for-byte at each call site in
 * `AreaMarkerLayer.tsx`. It intentionally does NOT touch `pinSvg`/
 * `gradCapSvg`/the school-first plum chips/the agricultural layers/the legacy
 * `makeAreaCard`/`makeClusterIcon`/`makeDotIcon` builders — those are out of
 * this commit's scope (team-lead plan D3).
 *
 * ── SECURITY (binding, qa-fast) ──
 * Every fragment below is a PURE TEMPLATE: it never escapes anything itself,
 * and it never embeds a hardcoded/default unescaped literal. Callers MUST
 * pass already-`escapeHtml()`-ed values (labels, node keys, aria-label text)
 * — exactly the same discipline every existing call site in
 * `AreaMarkerLayer.tsx` already follows. `escapeHtml()` happens at the POINT
 * OF USE (the builder functions), never inside these fragment definitions.
 */

/**
 * The outer wrapper style shared BYTE-FOR-BYTE by all three in-scope
 * builders' root `<div>` — the anchor-to-marker-tip transform, font
 * inheritance, and interaction affordances.
 */
export const MARKER_SHELL_STYLE =
  'transform:translate(-50%,-100%);font-family:inherit;pointer-events:auto;cursor:pointer;outline:none;';

export interface MarkerInteractiveAttrsOptions {
  /** `data-testid` value — literal, not escaped (never carries server data). */
  testId: string;
  /**
   * `data-node-key` value — ALREADY escaped by the caller (`escapeHtml`).
   * Omitted entirely (no attribute emitted) for a marker with no stable
   * per-instance identity of its own.
   */
  nodeKey?: string;
  /** `data-selected` value. Omitted for a marker with no selected state (e.g. a visual cluster). */
  selected?: boolean;
  /** `aria-label` value — ALREADY escaped/joined by the caller. */
  ariaLabel: string;
}

/**
 * The `data-testid`/`data-node-key`/`data-selected`/`tabindex`/`role`/
 * `aria-label` attribute set every keyboard-operable marker in this file
 * carries. Pure string assembly — no escaping performed here (see the
 * module-level SECURITY note above).
 */
export function markerInteractiveAttrs(opts: MarkerInteractiveAttrsOptions): string {
  const parts = [`data-testid="${opts.testId}"`];
  if (opts.nodeKey != null) {
    parts.push(`data-node-key="${opts.nodeKey}"`);
  }
  if (opts.selected != null) {
    parts.push(`data-selected="${opts.selected}"`);
  }
  parts.push('tabindex="0"', 'role="button"', `aria-label="${opts.ariaLabel}"`);
  return parts.join(' ');
}

export interface CardContainerStyleOptions {
  radiusPx: number;
  background: string;
  /** Full `border` shorthand value, e.g. `"1px solid #fff"` or `"1.5px dashed #fff"`. */
  borderCss: string;
  boxShadow: string;
  /** Fixed width — mutually exclusive with `minWidthPx`, matching each builder's own sizing contract. */
  widthPx?: number;
  /** Min-width only (auto width otherwise) — used by the destination card, which is not grid-clustered. */
  minWidthPx?: number;
  /**
   * `box-sizing:border-box` — required by the two grid-clustered card
   * builders (`makeSingleAreaChildCard`/`makeAreaVisualClusterCard`) whose
   * fixed CSS width must equal `AREA_CARD_FOOTPRINT_WIDTH_PX` exactly
   * (areaClustering.ts's no-overlap geometry contract); omitted by the
   * destination card, which is not part of that grid.
   */
  boxSizingBorderBox?: boolean;
}

/**
 * The `display:flex; flex-direction:column; gap:2px; padding:8px 12px; ...`
 * card-container style shared (parametrically) by all three in-scope
 * builders' inner card `<div>`.
 */
export function cardContainerStyle(opts: CardContainerStyleOptions): string {
  const boxSizing = opts.boxSizingBorderBox ? 'box-sizing:border-box;' : '';
  const sizing =
    opts.widthPx != null
      ? `width:${opts.widthPx}px;`
      : opts.minWidthPx != null
        ? `min-width:${opts.minWidthPx}px;`
        : '';
  return (
    `${boxSizing}display:flex;flex-direction:column;gap:2px;${sizing}` +
    `padding:8px 12px;border-radius:${opts.radiusPx}px;background:${opts.background};` +
    `border:${opts.borderCss};box-shadow:${opts.boxShadow};`
  );
}
