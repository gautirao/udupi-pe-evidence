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
 *
 * ── ISSUE #2305 STAGE 1 (zero-collision precursor) ──
 * `visualClusterCardHtml` below builds the approved "Option B" markup for the
 * client-side visual AREA cluster card (today's `makeAreaVisualClusterCard`,
 * `AreaMarkerLayer.tsx:832-903`). This stage adds the pure builder and its
 * unit tests ONLY — no production call site references it yet. Wiring
 * `AreaMarkerLayer.tsx` to call it is Stage 2, deferred until Issue #1943
 * merges (see `.claude/handoffs/issue-2305/team-lead-plan-stage1.toml`).
 */
import {
  NAVY_800,
  PAPER,
  RADIUS_LG,
  RADIUS_FULL,
  SHADOW_LG,
  DESTINATION_PILL_BG,
  DESTINATION_TEXT_SOFT,
  DESTINATION_TEXT_MUTED,
} from './markerTokens';

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

/**
 * A 12x12 magnifier-plus glyph for the Option B card's "Zoom in" footer —
 * design source `ExpMap.jsx:8` (`MG.zoom`). `aria-hidden="true"` and
 * `flex-shrink:0` are this repo's existing svg-helper convention (see
 * `pinSvg`, `AreaMarkerLayer.tsx:215-216`) and are additions to the mock's
 * raw string, not part of the design source itself.
 */
function zoomGlyphSvg(color: string): string {
  return (
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="2.4" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0;">` +
    `<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-3.5-3.5"/></svg>`
  );
}

export interface VisualClusterCardHtmlOptions {
  /**
   * The full `data-testid`/`data-node-key`/`data-selected`/`tabindex`/
   * `role`/`aria-label` attribute set for the outer shell — already built by
   * `markerInteractiveAttrs`.
   */
  shellAttrs: string;
  /**
   * `title="..."` attribute (already assembled by the caller), or `''` when
   * no name was truncated. Placed on the `.rc-shell` element (not the outer
   * wrapper) so hovering anywhere on the shell reveals the full names.
   */
  titleAttr: string;
  /** Representative-names HTML — ALREADY escaped/joined by the caller. */
  namesHtml: string;
  /**
   * Hero listing-count number HTML — ALREADY escaped/formatted (e.g.
   * `toLocaleString('en-IN')`). Ignored when `zeroPhraseHtml` is set.
   */
  heroNumberHtml?: string;
  /**
   * Hero unit word ('listing' / 'listings') HTML — ALREADY escaped. Ignored
   * when `zeroPhraseHtml` is set.
   */
  heroUnitHtml?: string;
  /**
   * Zero-count guard phrase (e.g. 'No listings yet') — ALREADY escaped. When
   * set, replaces the number+unit hero row entirely so a bare mono "0" is
   * never rendered.
   */
  zeroPhraseHtml?: string;
  /** Pill label HTML — ALREADY escaped (e.g. `N areas with matches`). */
  pillHtml: string;
  /**
   * Journey accent — colours the footer icon/text/chevron and the tail.
   *
   * KNOWN, DELIBERATE DEVIATION from the design source: `regional-cluster-
   * option-b.html` actually uses TWO shades — copper-500 for the zoom-glyph
   * SVG stroke and the `›` chevron, copper-600 for the "Zoom in" label text
   * and the tail. This function deliberately threads ONE `accent` through
   * all four, matching the existing single-accent convention of the sibling
   * `makeAreaVisualClusterCard`. The two-tone split is deferred rather than
   * implemented lopsidedly: the schools journey has no `PLUM_500` (lighter)
   * counterpart to `PLUM_600` — same class of gap as the `PLUM_600`/
   * `PLUM_100` "known gap" documented in `markerTokens.ts` (no `--plum-*`
   * tokens exist in the design system at all). Minting one is a
   * design-system decision, not an implementation detail — do not guess a
   * value here. MUST be revisited when Stage 2 wires this builder into
   * `AreaMarkerLayer.tsx`'s call site.
   */
  accent: string;
  /** Fixed shell width in px (the design's flat 172px, never content-derived). */
  widthPx: number;
  /**
   * Whether this cluster is the current focused/selected cluster — emits the
   * double-ring box-shadow and the heavier shell border (option-b.html:17).
   */
  isFocusedSelected: boolean;
  /**
   * Optional extra attribute (e.g. `data-journey="schools"`, or `''`) —
   * already assembled by the caller.
   *
   * PR #2315 REVIEW FIX — placed on the OUTER wrapper div (the same element
   * `shellAttrs` sits on, which carries `data-testid="area-visual-cluster-
   * marker"`), NOT on the inner `.rc-shell`. `index.css`'s hover/focus
   * footer-tint rule for the schools journey is a COMPOUND selector —
   * `[data-testid="area-visual-cluster-marker"][data-journey="schools"]
   * :hover .rc-footer` — which requires BOTH attributes on the SAME
   * element to ever match. Putting `journeyAttr` on `.rc-shell` (a
   * DIFFERENT element from the one carrying `data-testid`, per
   * `shellAttrs`'s placement below) meant that selector could never match
   * at all: on the schools journey, hover/keyboard-focus silently fell
   * through to the generic copper tint instead of plum. Two other fixes
   * were considered and rejected: folding this into `shellAttrs`/
   * `markerInteractiveAttrs` (that helper is shared with
   * `makeSingleAreaChildCard` and other builders — a cluster-specific
   * attribute there widens blast radius for no gain), and emitting the
   * attribute on BOTH elements (two sources of truth for one fact — the
   * exact drift class this issue has repeatedly been bitten by).
   */
  journeyAttr: string;
  /**
   * Pre-escaped `font-family` VALUE for the sans stack — MUST use the
   * `*_ATTR`-safe form, never the raw `FONT_SANS` constant (its embedded
   * double quotes silently truncate a style attribute; see
   * `AreaMarkerLayer.tsx:202-211`).
   */
  fontSansAttr: string;
  /** Pre-escaped `font-family` value for the mono stack — same caveat as `fontSansAttr`. */
  fontMonoAttr: string;
}

/**
 * Issue #2305 STAGE 2 — the Option B cluster card's fixed painted width, and
 * a conservative worst-case rendered-height bound. ONE symbol feeds BOTH the
 * `widthPx` passed to `visualClusterCardHtml` below AND the
 * `clusterVisibleAreaMembers` footprint override at the AreaMarkerLayer.tsx
 * call site — never a locally re-typed literal at either site (see
 * `areaClustering.ts:172`'s drift warning, which this shared export exists
 * to avoid).
 *
 * `VISUAL_CLUSTER_CARD_WIDTH_PX` (172) is the design's flat, content-independent
 * shell width (`regional-cluster-option-b.html`).
 *
 * `VISUAL_CLUSTER_CARD_HEIGHT_PX` (140) is a MEASURED, not inferred, bound.
 * Method: rendered the actual `.rc-shell` markup at `widthPx:172` in a real
 * Chromium browser (viewport 1457x812) with the tallest realistic content
 * variant — two long representative names ("Kempapura Extended Village
 * Layout Extension, Another Excessively Long Locality Name Here") that clamp
 * to the full 2 lines the `-webkit-line-clamp:2` name row allows (content
 * beyond 2 lines cannot grow the box further — the clamp is the true content
 * ceiling), plus a non-zero hero row ("1,234 listings") and a pill
 * ("+3 areas with matches"). Measured `getBoundingClientRect().height` =
 * 122.25px.
 *
 * FIX N5 (main-agent-ruling-b1-footprint-floor.toml bundle) — the margin
 * this constant actually banks over that measurement DEPENDS on whether the
 * 122.25px figure covered `.rc-shell` alone or the whole painted marker
 * (`.rc-shell` PLUS the 7px `.rc-tail` triangle rendered as its sibling
 * below it — see `visualClusterCardHtml` below). The record above says
 * "rendered the actual `.rc-shell` markup" and reports
 * `getBoundingClientRect().height` of that markup — read literally, this was
 * a measurement of `.rc-shell` ALONE, not the tail. Taking that at face
 * value: the true painted marker is `.rc-shell` (122.25px) + `.rc-tail`
 * (7px) ≈ 129.25px, and the real margin this 140px constant banks is
 * ~10.75px / ~8% — smaller than the "~18px / ~15%" this comment previously
 * (incorrectly) claimed, which implicitly treated the 122.25px figure as if
 * it already covered the whole marker including the tail. This document
 * cannot fully rule out that the original measurement pass actually
 * screenshotted/measured the combined marker and mislabeled it "`.rc-shell`
 * markup" in the writeup rather than the DOM query itself — there is no
 * saved screenshot or raw measurement script in this record to settle that
 * definitively either way. The conservative reading (tail excluded, ~8%
 * margin) is the one carried forward here, since assuming the LARGER margin
 * without proof would risk silently understating how tight this bound
 * actually is. The 140px constant itself is NOT changed by this correction —
 * ~10.75px is still real, non-negative margin, and over-estimating remains
 * the safe direction (see below) regardless of which reading is correct.
 *
 * 140px therefore keeps a ~10.75px / ~8% margin over that measurement (see
 * the N5 correction above) for font-metric variance (the measurement used
 * the system-ui fallback stack, not a guaranteed-loaded "Plus Jakarta Sans"/
 * "Geist Mono") and general cross-browser sub-pixel rounding. Over-
 * estimating is the safe direction per `areaClustering.ts:177-179` (an
 * extra merge, never a missed one) — under-estimating is the only way the
 * no-overlap invariant actually breaks, which is why this is measured
 * rather than guessed.
 */
export const VISUAL_CLUSTER_CARD_WIDTH_PX = 172;
export const VISUAL_CLUSTER_CARD_HEIGHT_PX = 140;

/**
 * Builds the approved "Option B" client-side visual AREA cluster card: a
 * connected navy info section + white "Zoom in" footer + accent-coloured
 * tail, all inside one overflow:hidden shell (design source
 * `docs/design/retrends-design-system/ui_kits/new_discover/regional-cluster-option-b.html`,
 * `ExpMap.jsx:46-105`). Pure string builder — no React/Leaflet/DOM — see the
 * module-level SECURITY note: nothing here escapes its inputs.
 */
export function visualClusterCardHtml(opts: VisualClusterCardHtmlOptions): string {
  const {
    shellAttrs,
    titleAttr,
    namesHtml,
    heroNumberHtml,
    heroUnitHtml,
    zeroPhraseHtml,
    pillHtml,
    accent,
    widthPx,
    isFocusedSelected,
    journeyAttr,
    fontSansAttr,
    fontMonoAttr,
  } = opts;

  const nameMaxWidthPx = widthPx - 28;
  const shellBorderColor = isFocusedSelected ? 'rgba(27,42,69,0.4)' : 'rgba(27,42,69,0.24)';
  const shellBoxShadow = isFocusedSelected
    ? `0 0 0 2px ${PAPER}, 0 0 0 4px ${NAVY_800}, ${SHADOW_LG}`
    : SHADOW_LG;

  const heroRow =
    zeroPhraseHtml != null
      ? `<span style="font-family:${fontSansAttr};font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${DESTINATION_TEXT_MUTED};margin-top:2px;">${zeroPhraseHtml}</span>`
      : `<span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">` +
        `<span style="font-family:${fontMonoAttr};font-size:20px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${heroNumberHtml}</span>` +
        `<span style="font-family:${fontSansAttr};font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${DESTINATION_TEXT_MUTED};">${heroUnitHtml}</span>` +
        `</span>`;

  return (
    `<div ${shellAttrs}${journeyAttr ? ` ${journeyAttr}` : ''} style="${MARKER_SHELL_STYLE}">` +
    `<div class="rc-shell"${titleAttr ? ` ${titleAttr}` : ''} style="width:${widthPx}px;box-sizing:border-box;border-radius:${RADIUS_LG};overflow:hidden;box-shadow:${shellBoxShadow};border:1.5px solid ${shellBorderColor};">` +
    `<div style="padding:9px 14px;background:${NAVY_800};color:#fff;display:flex;flex-direction:column;align-items:center;gap:2px;">` +
    `<span style="font-family:${fontSansAttr};font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${nameMaxWidthPx}px;">${namesHtml}</span>` +
    heroRow +
    `<span style="margin-top:3px;padding:1px 9px;border-radius:${RADIUS_FULL};background:${DESTINATION_PILL_BG};font-size:10px;font-weight:600;color:${DESTINATION_TEXT_SOFT};white-space:nowrap;">${pillHtml}</span>` +
    `</div>` +
    `<div class="rc-footer" style="background:${PAPER};padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:5px;">` +
    zoomGlyphSvg(accent) +
    `<span style="font-family:${fontSansAttr};font-size:11.5px;font-weight:700;color:${accent};">Zoom in</span>` +
    `<span style="font-size:13px;font-weight:700;color:${accent};line-height:1;">&#8250;</span>` +
    `</div>` +
    `</div>` +
    `<div class="rc-tail" style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${accent};margin:0 auto;"></div>` +
    `</div>`
  );
}
