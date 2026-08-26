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
 * ── ISSUE #2330 (Discover map marker reskin) ──
 * `markerShellHtml` below is the shared connected-card shell for all three
 * map action-marker families (Explore / Zoom in / View homes / View
 * schools) — it REPLACES the pre-#2330 `visualClusterCardHtml` (which only
 * ever painted the "Zoom in" treatment). `AreaMarkerLayer.tsx`'s
 * `makeDestinationCard`, `makeAreaVisualClusterCard`, and
 * `makeSingleAreaChildCard` all assemble their own content and call this one
 * shared primitive for geometry/palette — see that function's own doc.
 */
import {
  NAVY_800,
  PAPER,
  RADIUS_LG,
  SHADOW_MD,
  SHADOW_LG,
  COPPER_500,
  COPPER_600,
  COPPER_100,
  PLUM_600,
  PLUM_TINT,
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
 * A 12x12 magnifier-plus glyph for the "Zoom in" footer — design source
 * `ExpMap.jsx:8` (`MG.zoom`). `aria-hidden="true"` and `flex-shrink:0` are
 * this repo's existing svg-helper convention (see `pinSvg`,
 * `AreaMarkerLayer.tsx:215-216`) and are additions to the mock's raw string,
 * not part of the design source itself.
 */
export function zoomGlyphSvg(color: string): string {
  return (
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="2.4" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0;">` +
    `<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-3.5-3.5"/></svg>`
  );
}

/**
 * A 13x13 compass glyph for the "Explore" footer — design source
 * `ExpMap.jsx` `MG.compass` (Issue #2330). Same aria-hidden/flex-shrink
 * convention as `zoomGlyphSvg`.
 */
export function compassGlyphSvg(color: string): string {
  return (
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">` +
    `<circle cx="12" cy="12" r="9"/><path d="m15.2 8.8-1.8 4.6-4.6 1.8 1.8-4.6z" fill="${color}" stroke="none"/></svg>`
  );
}

/**
 * A 14x14 house glyph for the "View homes" footer — design source
 * `ExpMap.jsx` `MG.home` (Issue #2330). Same aria-hidden/flex-shrink
 * convention as `zoomGlyphSvg`.
 */
export function homeGlyphSvg(color: string): string {
  return (
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">` +
    `<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"/>` +
    `<path d="M9.5 20v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V20"/></svg>`
  );
}

/** The four action behaviours the shared shell renders — orthogonal to `journey` (never branch the palette off `actionKind` alone; both are read together, see `resolveMarkerPalette`). */
export type MarkerActionKind = 'explore' | 'zoom' | 'view-homes' | 'view-schools';
/** The two accent journeys the shell supports — orthogonal to `actionKind`. */
export type MarkerJourney = 'areas' | 'schools';

export interface MarkerShellHtmlOptions {
  /**
   * The full `data-testid`/`data-node-key`/`data-selected`/`tabindex`/
   * `role`/`aria-label` attribute set for the outer shell — already built by
   * `markerInteractiveAttrs`. `markerShellHtml` additionally appends
   * `data-action-kind`/`data-marker-shell` (and `journeyAttr`'s
   * `data-journey`, when non-empty) to the SAME outer element — never widens
   * `markerInteractiveAttrs` itself (out of scope, see the approved plan's
   * forbidden_changes).
   */
  shellAttrs: string;
  /**
   * `title="..."` attribute (already assembled by the caller), or `''` when
   * no name was truncated. Placed on the `.rc-shell` element (not the outer
   * wrapper) so hovering anywhere on the shell reveals the full name(s).
   */
  titleAttr: string;
  /** Which of the three behaviours this marker represents. */
  actionKind: MarkerActionKind;
  /** Which accent journey this marker paints in. */
  journey: MarkerJourney;
  /**
   * Shell width in px — a plain ARGUMENT (Issue #2330 D1), never hardcoded
   * here. The leaf (`view-homes`/`view-schools`) passes the fixed
   * `AREA_CARD_FOOTPRINT_WIDTH_PX`; `explore`/`zoom` pass their own
   * inventory-scaled width (132–170 single, 150–206 combined) — this
   * primitive is content/width-agnostic, it only paints at whatever width
   * the caller supplies.
   */
  widthPx: number;
  /**
   * Whether this marker is the current selection — emits the persistent
   * outline + heavier/solid border (`zoom`) or deepened shadow, per
   * `VISUAL_RULES.md`'s "Selected" state and `marker-action-system.html`'s
   * `.st-selected` rules.
   */
  isSelected: boolean;
  /**
   * Optional extra attribute (e.g. `data-journey="schools"`, or `''`) —
   * already assembled by the caller, placed on the OUTER wrapper (the same
   * element `shellAttrs`/`data-testid` sit on — see AC16: CSS may key on
   * `data-marker-shell`/`data-journey`/`data-action-kind`, never on
   * `data-testid`, but every one of those attributes must still live on the
   * SAME element for a compound selector to ever match; PR #2315's fix for
   * the pre-#2330 Option-B card established this same colocation rule).
   */
  journeyAttr: string;
  /**
   * Pre-escaped `font-family` VALUE for the sans stack — MUST use the
   * `*_ATTR`-safe form, never the raw `FONT_SANS` constant (its embedded
   * double quotes silently truncate a style attribute; see
   * `AreaMarkerLayer.tsx:202-211`). Used only for the footer's own label —
   * the identity section's own fonts are chosen by the caller inside
   * `identityHtml`.
   */
  fontSansAttr: string;
  /**
   * The identity ("rc-body") section's fully-assembled INNER content — name,
   * hero count row (or zero-state), pill/secondary line — ALREADY escaped
   * and laid out by the caller (`AreaMarkerLayer.tsx`'s three builders own
   * every content decision; this primitive owns geometry/palette only, see
   * the approved plan's shared-primitive scope note).
   */
  identityHtml: string;
  /** Pre-built, pre-coloured footer glyph SVG (compass/magnifier/home/cap) — see `compassGlyphSvg`/`zoomGlyphSvg`/`homeGlyphSvg`. */
  footerIconHtml: string;
  /**
   * The footer's fixed action copy — literally "Explore" / "Zoom in" /
   * "View homes" / "View schools" (AC5/AC12: never carries a count, never a
   * re-derived string) — a compile-time literal from the call site, not
   * server/user data, so it is never escaped here (matches this file's
   * existing convention for `testId`, see `markerInteractiveAttrs`).
   */
  footerLabelText: string;
}

interface MarkerPalette {
  bodyBg: string;
  bodyFg: string;
  borderRest: string;
  borderSelected: string;
  /** `border` is a solid accent for `zoom` regardless of selection (`marker-action-system.html`'s `.mshell.zoom.homes{border:1.5px solid #B05C3A}`) — never swaps rest/selected for that variant. */
  borderIsAccentSolid: boolean;
  footerBg: string;
  footerFg: string;
  tailColor: string;
  selectedOutlineColor: string;
}

/**
 * Resolves the shell's body/footer/border/tail colours from the
 * (`actionKind`, `journey`) PAIR — never branched off `actionKind` alone
 * (the approved plan's explicit instruction: the two inputs are orthogonal).
 * Mirrors `ExpMap.jsx`'s `navMarkerHTML`/`areaPinHTML` palette exactly;
 * `VISUAL_RULES.md`'s "Colours (exact)" and "Areas vs Schools palette
 * mapping" sections are this function's source of truth.
 */
function resolveMarkerPalette(actionKind: MarkerActionKind, journey: MarkerJourney): MarkerPalette {
  const isSchools = journey === 'schools';
  if (actionKind === 'explore') {
    const accent = isSchools ? PLUM_600 : COPPER_500;
    return {
      bodyBg: NAVY_800,
      bodyFg: PAPER,
      borderRest: 'rgba(27,42,69,0.24)',
      borderSelected: 'rgba(27,42,69,0.4)',
      borderIsAccentSolid: false,
      footerBg: accent,
      footerFg: PAPER,
      tailColor: accent,
      selectedOutlineColor: NAVY_800,
    };
  }
  if (actionKind === 'zoom') {
    const accent = isSchools ? PLUM_600 : COPPER_500;
    const accentText = isSchools ? PLUM_600 : COPPER_600;
    return {
      bodyBg: isSchools ? PLUM_TINT : COPPER_100,
      bodyFg: NAVY_800,
      borderRest: accent,
      borderSelected: accent,
      borderIsAccentSolid: true,
      footerBg: PAPER,
      footerFg: accentText,
      tailColor: accent,
      selectedOutlineColor: accent,
    };
  }
  // 'view-homes' | 'view-schools'
  const primary = isSchools ? PLUM_600 : NAVY_800;
  const borderRgb = isSchools ? '94,82,134' : '27,42,69';
  return {
    bodyBg: PAPER,
    bodyFg: NAVY_800,
    borderRest: `rgba(${borderRgb},0.28)`,
    borderSelected: `rgba(${borderRgb},0.5)`,
    borderIsAccentSolid: false,
    footerBg: primary,
    footerFg: PAPER,
    tailColor: primary,
    selectedOutlineColor: primary,
  };
}

/**
 * Issue #2330 (AMEND-A, rework-request-user-correction-1.toml) — the ONLY
 * footprint constant this primitive itself owns: the fixed COLLISION
 * FOOTPRINT used SOLELY as the `clusterAreaMembers`/`clusterVisibleAreaMembers`
 * collision-safety input at the two call sites that merge dense
 * 'clusters'/'directions'/'areas' children (`AreaMarkerLayer.tsx:1223`'s
 * `Math.max` floor and `AreaMarkerLayer.tsx:1444`'s `footprintWidthPx`). It
 * is NOT, and has never been, the painted width of the card itself.
 *
 * `VISUAL_CLUSTER_CARD_WIDTH_PX` REVERTED to its pre-#2330 value of 172
 * (it was briefly raised to 206 during this issue's gate-2 pass; that change
 * altered live clustering/merge behaviour, which is out of scope for this
 * reskin and belongs to #1943 instead — see AMEND-A). This constant is a
 * clustering INPUT, not a rendering output: changing it changes which
 * markers merge, independent of anything painted on screen.
 *
 * D1 is UNCHANGED by this revert: Explore/Zoom continue to PAINT at their
 * own inventory-scaled width (132–170px single, 150–206px combined — see
 * `AreaMarkerLayer.tsx`'s width formula), which does not read this constant.
 * Because the painted width can now be as wide as 206px while the collision
 * footprint this constant defines is only 172px, a wide COMBINED "Zoom in"
 * card can paint wider than the footprint that was used to decide whether it
 * overlaps its neighbours. That paint-vs-collision gap is a KNOWN,
 * DEFERRED OBSERVATION — deliberately NOT fixed here, and owned by #1943.
 * Do not attempt to close it by re-raising this constant, changing
 * `cellSizePx`, or touching the merge algorithm in this issue.
 *
 * `VISUAL_CLUSTER_CARD_HEIGHT_PX` (140) is unaffected by AMEND-A and is
 * carried forward, UNCHANGED, from the pre-#2330 Option-B measurement below
 * — the new shell's identity section (name/count/pill) and footer occupy
 * the same vertical budget as before; this issue's scope is a footprint
 * CONSTANT/doc-comment change for the AREA leaf only
 * (`AREA_CARD_FOOTPRINT_HEIGHT_PX`, see `areaClustering.ts`), not a
 * re-measurement of this collision-safety ceiling. A follow-up should
 * re-verify this bound in a real browser against the new shell markup if the
 * identity/footer padding ever changes.
 *
 * Original measurement record (pre-#2330, Option-B "Zoom in" fixed-172 card):
 * rendered the actual `.rc-shell` markup at `widthPx:172` in a real Chromium
 * browser (viewport 1457x812) with the tallest realistic content variant —
 * two long representative names that clamp to the full 2 lines the
 * `-webkit-line-clamp:2` name row allows, plus a non-zero hero row and a
 * pill. Measured `getBoundingClientRect().height` = 122.25px; the true
 * painted marker (`.rc-shell` + the 7px `.rc-tail` triangle) ≈ 129.25px, so
 * 140px keeps a ~10.75px / ~8% margin over that measurement (see the
 * historical N5 correction this doc previously carried) — over-estimating is
 * the safe direction, so this margin is retained as-is.
 */
export const VISUAL_CLUSTER_CARD_WIDTH_PX = 172;
export const VISUAL_CLUSTER_CARD_HEIGHT_PX = 140;

/**
 * The shared connected-card shell for all three Discover map action-marker
 * families (Explore / Zoom in / View homes / View schools) — Issue #2330.
 * REPLACES the pre-#2330 `visualClusterCardHtml` (which only ever painted
 * the "Zoom in" treatment). Geometry- and palette-only: one identity section
 * (rounded top) flush against one attached, full-width action footer
 * (rounded bottom, no gap), one shared shadow/border/radius around both, and
 * one centred downward CSS-triangle tail — never a horizontal split-capsule,
 * matching `VISUAL_RULES.md`'s "Map action-marker system" section verbatim.
 * Every content decision (name truncation, count/grammar, pill, secondary
 * line, icon choice, width) stays at the `AreaMarkerLayer.tsx` call sites —
 * this function never reads/derives content, it only lays out whatever
 * `identityHtml`/`footerIconHtml`/`footerLabelText` it is handed. Pure string
 * builder — no React/Leaflet/DOM — see the module-level SECURITY note:
 * nothing here escapes its inputs; every caller MUST pre-escape.
 */
export function markerShellHtml(opts: MarkerShellHtmlOptions): string {
  const {
    shellAttrs,
    titleAttr,
    actionKind,
    journey,
    widthPx,
    isSelected,
    journeyAttr,
    fontSansAttr,
    identityHtml,
    footerIconHtml,
    footerLabelText,
  } = opts;

  const palette = resolveMarkerPalette(actionKind, journey);
  const borderColor = palette.borderIsAccentSolid
    ? palette.borderRest
    : isSelected
      ? palette.borderSelected
      : palette.borderRest;
  const shellBoxShadow = isSelected ? SHADOW_LG : SHADOW_MD;
  const outline = isSelected
    ? `outline:2px solid ${palette.selectedOutlineColor};outline-offset:2px;`
    : '';

  return (
    `<div ${shellAttrs} data-action-kind="${actionKind}" data-marker-shell="true"${journeyAttr ? ` ${journeyAttr}` : ''} style="${MARKER_SHELL_STYLE}">` +
    `<div class="rc-shell"${titleAttr ? ` ${titleAttr}` : ''} style="width:${widthPx}px;box-sizing:border-box;border-radius:${RADIUS_LG};overflow:hidden;box-shadow:${shellBoxShadow};border:1.5px solid ${borderColor};${outline}">` +
    `<div class="rc-body" style="padding:9px 14px;background:${palette.bodyBg};color:${palette.bodyFg};display:flex;flex-direction:column;gap:2px;">` +
    identityHtml +
    `</div>` +
    `<div class="rc-footer" style="background:${palette.footerBg};padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:5px;">` +
    footerIconHtml +
    `<span style="font-family:${fontSansAttr};font-size:11.5px;font-weight:700;color:${palette.footerFg};">${footerLabelText}</span>` +
    `<span style="font-size:13px;font-weight:700;color:${palette.footerFg};line-height:1;">&#8250;</span>` +
    `</div>` +
    `</div>` +
    `<div class="rc-tail" style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${palette.tailColor};margin:0 auto;"></div>` +
    `</div>`
  );
}
