/**
 * Marker design tokens — Issue #2088 (commit 1/7).
 *
 * Pure named constants, zero DOM. Extracted from the literal ReTrends palette
 * that used to be inlined directly in `AreaMarkerLayer.tsx` (see that file's
 * git history around the "ReTrends palette (literal — divIcon HTML is not
 * processed by Tailwind/CSS-vars)" comment).
 *
 * ── WHY THIS FILE EXISTS INSTEAD OF src/index.css / tailwind.config.ts ──
 * Every value here backs a Leaflet `divIcon` HTML STRING — raw markup Leaflet
 * injects outside React's render tree and outside PostCSS/Tailwind's class
 * scanner. Neither a Tailwind utility class nor a CSS custom property consumed
 * via `var(--x)` in a stylesheet reaches this markup (there is no stylesheet
 * cascade to inherit from — divIcon HTML is a plain string). Adding these
 * values to `src/index.css` would create a THIRD, competing token surface in a
 * file every other surface in the app also consumes — global blast radius for
 * a marker-local concern (design_decisions.D3, issue-2088 team-lead plan).
 *
 * ── SOURCE OF TRUTH ──
 * Every constant below is asserted, by a dedicated parity test
 * (`__tests__/markerTokens.parity.test.ts`), to equal the value PARSED at test
 * time from `docs/design/retrends-design-system/tokens/*.css` — never retyped
 * by hand into the test. If the design system moves, the parity test goes red
 * instead of silently drifting.
 *
 * Scope: only the values the FOUR mock-governed divIcon builders
 * (`markerPrimitives.ts`) need — the stable-hierarchy control, the dashed
 * presentation cluster, the canonical Area pin, and the listing markers. This
 * file does NOT touch the legacy `pinSvg`/`gradCapSvg`/school/agri chip colors
 * still inlined in `AreaMarkerLayer.tsx` — that extraction is out of this
 * commit's scope (team-lead plan D3: "Scope the extraction to the four
 * mock-governed builders only").
 */

// ── Colors ───────────────────────────────────────────────────────────────
export const NAVY_900 = '#0E1626';
export const NAVY_800 = '#1B2A45';
export const NAVY_700 = '#26395B';
export const PAPER = '#FFFFFF';
export const COPPER_500 = '#B05C3A';
export const COPPER_600 = '#934B2D';
// Accent tint (colors.css:22, --copper-100) — Option B cluster-marker footer
// hover tint, Issue #2305.
export const COPPER_100 = '#F2E8E1';
export const PLUM_600 = '#5E5286';
export const PLUM_100 = '#DED7EC';
// Issue #2330 — Discover map-marker action-system reskin. `--plum-tint`
// (VISUAL_RULES.md §"Journey / mode accent colours": "plum accent ...
// --plum-tint #F1EDF7 (Zoom body tint / hover footer tint)"). Distinct from
// PLUM_100 above (#DED7EC) — that token is the pre-#2330 dashed-cluster
// footer-hover tint being SUPERSEDED by this issue's Zoom-in body/hover-footer
// treatment; both remain exported since PLUM_100 has no other in-repo
// consumer this issue is scoped to touch.
export const PLUM_TINT = '#F1EDF7';
export const EVERGREEN_600 = '#1F7A5C';
export const GREY_900 = '#111827';
export const GREY_700 = '#374151';
export const GREY_500 = '#6B7280';
// Verbatim (spacing included) — must byte-match colors.css's `--border` value
// exactly, since the parity test parses and compares the literal text.
export const BORDER = 'rgba(17, 24, 39, 0.09)';

// ── Radii ────────────────────────────────────────────────────────────────
export const RADIUS_LG = '12px';
export const RADIUS_FULL = '9999px';

// ── Shadows ──────────────────────────────────────────────────────────────
// Verbatim (spacing included) — must byte-match elevation.css's values.
export const SHADOW_MD = '0 4px 10px rgba(17, 24, 39, 0.07), 0 2px 4px rgba(17, 24, 39, 0.05)';
export const SHADOW_LG = '0 12px 28px rgba(17, 24, 39, 0.10), 0 4px 10px rgba(17, 24, 39, 0.05)';

// ── Font stacks ──────────────────────────────────────────────────────────
export const FONT_SANS =
  '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"Geist Mono", ui-monospace, "SF Mono", "Roboto Mono", monospace';

// ── Destination-card translucent-on-navy treatments (Issue #2088 item 2b) ──
// Same "known gap" precedent as PLUM_600/PLUM_100 above: these are literal
// values pinned to ExpMap.jsx's `destCardHTML`, which inlines them directly
// in the divIcon markup rather than sourcing them from a `--*` custom
// property in colors.css — there is no themed design-system token for a
// translucent white-on-navy border/pill/label, so `markerTokens.parity.
// test.ts` cannot (and does not) assert these against colors.css. Do not
// invent a --navy-card-* CSS var to close this gap; that is a design-system
// change, out of this issue's scope.
export const DESTINATION_BORDER_REST = 'rgba(255, 255, 255, 0.42)';
export const DESTINATION_BORDER_ACTIVE = 'rgba(255, 255, 255, 0.9)';
export const DESTINATION_PILL_BG = 'rgba(255, 255, 255, 0.14)';
export const DESTINATION_TEXT_SOFT = 'rgba(255, 255, 255, 0.9)';
export const DESTINATION_TEXT_SOFT_DIM = 'rgba(255, 255, 255, 0.78)';
export const DESTINATION_TEXT_MUTED = 'rgba(255, 255, 255, 0.72)';
