import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import { formatPrice } from '@/lib/formatters';
import { getPropertyTypeVisual, GLYPH_SVG_PATHS } from '@/lib/propertyTypeConfig';

/**
 * Issue #2382 — icon-factory functions extracted verbatim out of PropertyMap.tsx
 * (page-health follow-up from #2296). Behavior-preserving move only: no visual,
 * caching, or escaping change. Owns the residential/selected marker pill icons
 * and the Level-2 agri destination badge icon, plus the shared module-level
 * icon cache and price-label derivation they all build on.
 */

// Module-level icon cache — avoids creating a new DivIcon object on every render.
// R-A R1 fix: keyed by `${propertyType}|${colour}|${priceLabel}|${selected}` so:
//   - two types with the same formatted price get different icons (colour differs)
//   - selected variant is cached separately from default
//   - null/zero price always renders a '—' fallback (never ₹null / ₹NaN)
const iconCache = new Map<string, L.DivIcon>();

/**
 * Derive the price text shown inside the marker pill.
 *
 * Precedence (Issue #1942):
 *   1. Exact price (price != null && price > 0) → formatted price, `isBand: false`.
 *      This branch is BYTE-IDENTICAL to the pre-#1942 authed control flow — price
 *      === 0 does NOT satisfy `price > 0` and falls through to the band/residual
 *      branches below (0 is never treated as an exact price).
 *   2. Coarse `priceBand` (trimmed, non-empty) → the band string itself, `isBand: true`.
 *      Anonymous residential callers get `priceBand` in place of `price` (#1941);
 *      this is the fix for #1942 — anon pins previously showed a bare '—' because
 *      the icon builders only ever read `price`.
 *   3. Neither present → neutral '—' residual (type disc + glyph still render for
 *      distinguishability). Also covers price===0 with no band, and the agri path
 *      (agri never has a priceBand — always falls through to this residual).
 *
 * Returns `{ label, isPricePill, isBand }`. `isPricePill` is true whenever the pill
 * carries a real (non-residual) label — exact OR band — kept as the pre-existing
 * discriminant name; `isBand` further distinguishes an approximate band label from
 * an exact price so callers can pick the right aria-label copy.
 *
 * Issue #2051 (AC6c) — `monthlyRent`/`monthlyRentBand` extend the same precedence
 * for rent/lease listings, which previously fell through to the bare '—' residual
 * because sale's `price`/`priceBand` are always null for a rent-purpose row.
 * `monthlyRent` is already RUPEES (see [critical_finding_units] — do NOT divide by
 * 100), suffixed '/mo' per the repo's existing convention. Sale precedence (price >
 * priceBand) is checked FIRST and is byte-identical to the pre-#2051 behaviour; the
 * rent arms only apply when both sale fields are absent, which they always are for a
 * rent/lease-purpose row.
 */
export function deriveMarkerLabel(
  propertyType: string,
  price: number | null | undefined,
  priceBand?: string | null,
  monthlyRent?: number | null,
  monthlyRentBand?: string | null,
): { label: string; isPricePill: boolean; isBand: boolean } {
  if (price != null && price > 0) {
    return { label: formatPrice(price, 'INR'), isPricePill: true, isBand: false };
  }
  const trimmedBand = priceBand != null ? priceBand.trim() : '';
  if (trimmedBand !== '') {
    return { label: trimmedBand, isPricePill: true, isBand: true };
  }
  if (monthlyRent != null && monthlyRent > 0) {
    return { label: `${formatPrice(monthlyRent, 'INR')}/mo`, isPricePill: true, isBand: false };
  }
  const trimmedRentBand = monthlyRentBand != null ? monthlyRentBand.trim() : '';
  if (trimmedRentBand !== '') {
    return { label: `${trimmedRentBand}/mo`, isPricePill: true, isBand: true };
  }
  // Preserve the isPricePill discriminant — used by callers that need to distinguish
  // a real formatted price from a null/zero fallback without inspecting label content.
  return { label: '—', isPricePill: false, isBand: false };
}

/**
 * Build the inline SVG markup for a glyph disc.
 * Renders a 22×22 circle in `discColour` with a 12×12 white SVG path centred inside.
 */
function buildDiscSvg(glyphPath: string, discColour: string): string {
  return `<div style="
    width:22px;height:22px;border-radius:50%;background:${escapeHtml(discColour)};
    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
         stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <path d="${escapeHtml(glyphPath)}"/>
    </svg>
  </div>`;
}

/**
 * R-A — White rounded pill marker icon.
 * Shape: bg-white rounded-full pill, left type-coloured disc + glyph, right price text.
 * NULL/zero price: shows '—'; pill is still TYPE-distinguishable via disc colour + glyph.
 *
 * Cache key includes type colour so two different types with the same formatted price
 * are never cache-collided (R1 invariant).
 */
export interface MarkerContext {
  bedrooms?: number | null;
  sqft?: number | null;
  subtypeLabel?: string | null;
}

export function formatMarkerContextText(
  propertyType: string,
  context?: MarkerContext | null,
): string | null {
  if (!context) return null;
  const { bedrooms, sqft, subtypeLabel } = context;

  const typeLower = (propertyType || '').toLowerCase();
  const isCommercial = [
    'commercial',
    'commercial_building',
    'warehouse',
    'commercial_land',
    'shop',
    'office',
    'building',
  ].includes(typeLower) || (Boolean(subtypeLabel) && !['apartment', 'villa', 'plot', 'land', 'plots'].includes(subtypeLabel!.toLowerCase()));

  const parts: string[] = [];

  if (isCommercial) {
    if (subtypeLabel) {
      parts.push(subtypeLabel);
    } else if (typeLower === 'shop') {
      parts.push('Shop');
    } else if (typeLower === 'office') {
      parts.push('Office');
    } else if (typeLower === 'warehouse') {
      parts.push('Warehouse');
    } else if (typeLower === 'commercial_land') {
      parts.push('Commercial Land');
    } else if (typeLower === 'commercial_building' || typeLower === 'building') {
      parts.push('Commercial Building');
    }
  } else {
    if (bedrooms != null && bedrooms > 0) {
      parts.push(`${bedrooms} BHK`);
    }
  }

  if (sqft != null && sqft > 0) {
    parts.push(`${sqft.toLocaleString('en-IN')} sq ft`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * R-A — White rounded pill marker icon.
 * Shape: bg-white rounded-full pill, left type-coloured disc + glyph, right price text.
 * NULL/zero price: shows '—'; pill is still TYPE-distinguishable via disc colour + glyph.
 *
 * Cache key includes type colour so two different types with the same formatted price
 * are never cache-collided (R1 invariant).
 */
export const createMarkerIcon = (
  propertyType: string,
  price: number | null | undefined,
  priceBand?: string | null,
  monthlyRent?: number | null,
  monthlyRentBand?: string | null,
  context?: MarkerContext | null,
): L.DivIcon => {
  const { label, isBand } = deriveMarkerLabel(propertyType, price, priceBand, monthlyRent, monthlyRentBand);
  const visual = getPropertyTypeVisual(propertyType);
  const contextText = formatMarkerContextText(propertyType, context);
  const contextKey = contextText ? `|${contextText}` : '';
  const cacheKey = `${propertyType}|${visual.colour}|${label}${contextKey}|default`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const glyphPath = GLYPH_SVG_PATHS[visual.glyph];
  const discSvg = buildDiscSvg(glyphPath, visual.colour);
  const safeLabel = escapeHtml(label);
  const safeContext = contextText ? escapeHtml(contextText) : null;
  const ariaLabel = isBand
    ? `aria-label="${escapeHtml(`Approximate price ${label}${contextText ? `, ${contextText}` : ''}`)}"`
    : label === '—'
      ? `aria-label="${escapeHtml('Price unavailable')}"`
      : contextText
        ? `aria-label="${escapeHtml(`${label}, ${contextText}`)}"`
        : '';

  const contentHtml = safeContext
    ? `<div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
        <span style="font-family:ui-monospace,'Geist Mono','SF Mono',monospace;font-size:12px;font-weight:700;letter-spacing:-0.01em;color:hsl(221 39% 11%);">${safeLabel}</span>
        <span style="font-size:10px;font-weight:600;color:#6B7280;margin-top:1px;">${safeContext}</span>
       </div>`
    : `<span style="font-family:ui-monospace,'Geist Mono','SF Mono',monospace;font-size:12.5px;font-weight:700;letter-spacing:-0.01em;color:hsl(221 39% 11%);line-height:1;">${safeLabel}</span>`;

  const pillHtml = `
    <div data-testid="property-marker" ${ariaLabel} style="
      background:#FFFFFF;
      border:1px solid rgba(0,0,0,0.12);
      border-radius:12px;
      box-shadow:0 4px 10px rgba(17,24,39,0.07),0 2px 4px rgba(17,24,39,0.05);
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:${safeContext ? '4px 10px 4px 5px' : '5px 12px 5px 5px'};
      white-space:nowrap;
      pointer-events:auto;
      cursor:pointer;
    ">
      ${discSvg}
      ${contentHtml}
    </div>`;

  // Wrap in a translate so the pill bottom-edge sits at the listing coordinates.
  const html = `<div style="transform:translate(-50%,-100%);display:inline-block;">${pillHtml}</div>`;

  // Issue #1074 — 'property-marker' class + data-testid for E2E selectors.
  const icon = L.divIcon({
    className: 'custom-marker property-marker',
    html,
    // iconAnchor [0,0] because we use CSS translate(-50%,-100%) on the wrapper.
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

// Preserve: copper ring on selected marker (Issue #1547).
// Value grounded in design source: HSL 18 51% 46% → #B05C3A.
export const COPPER_COLOR = '#B05C3A';

/**
 * Issue #1547 — selected-state marker icon.
 * R-A: navy pill background (#1B2A45), white price text, semi-transparent white disc
 * containing a white glyph. Outer box-shadow adds the #1547 copper ring (35% opacity).
 * Scale(1.09) applied via CSS transform on the wrapper for the slight size-up effect.
 *
 * R1 cache: keyed by `${propertyType}|${colour}|${label}|selected` — distinct from
 * the default variant AND from any other type that might share the same formatted price.
 */
export const createSelectedMarkerIcon = (
  propertyType: string,
  price: number | null | undefined,
  priceBand?: string | null,
  monthlyRent?: number | null,
  monthlyRentBand?: string | null,
  context?: MarkerContext | null,
): L.DivIcon => {
  const { label, isBand } = deriveMarkerLabel(propertyType, price, priceBand, monthlyRent, monthlyRentBand);
  const visual = getPropertyTypeVisual(propertyType);
  const contextText = formatMarkerContextText(propertyType, context);
  const contextKey = contextText ? `|${contextText}` : '';
  const cacheKey = `${propertyType}|${visual.colour}|${label}${contextKey}|selected`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const glyphPath = GLYPH_SVG_PATHS[visual.glyph];
  // SELECTED: disc = semi-transparent white on the navy pill background
  const discSvg = buildDiscSvg(glyphPath, 'rgba(255,255,255,0.18)');
  const safeLabel = escapeHtml(label);
  const safeContext = contextText ? escapeHtml(contextText) : null;
  const ariaLabel = isBand
    ? `aria-label="${escapeHtml(`Approximate price ${label}${contextText ? `, ${contextText}` : ''}`)}"`
    : label === '—'
      ? `aria-label="${escapeHtml('Price unavailable')}"`
      : contextText
        ? `aria-label="${escapeHtml(`${label}, ${contextText}`)}"`
        : '';

  const contentHtml = safeContext
    ? `<div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
        <span style="font-family:ui-monospace,'Geist Mono','SF Mono',monospace;font-size:12px;font-weight:700;letter-spacing:-0.01em;color:#FFFFFF;">${safeLabel}</span>
        <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.85);margin-top:1px;">${safeContext}</span>
       </div>`
    : `<span style="font-family:ui-monospace,'Geist Mono','SF Mono',monospace;font-size:12.5px;font-weight:700;letter-spacing:-0.01em;color:#FFFFFF;line-height:1;">${safeLabel}</span>`;

  const pillHtml = `
    <div data-testid="property-marker" data-selected="true" ${ariaLabel} style="
      background:#1B2A45;
      border:1px solid rgba(0,0,0,0.15);
      border-radius:12px;
      box-shadow:0 0 0 3px rgba(176,92,58,0.35),0 4px 10px rgba(17,24,39,0.12),0 2px 4px rgba(17,24,39,0.08);
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:${safeContext ? '4px 10px 4px 5px' : '5px 12px 5px 5px'};
      white-space:nowrap;
      pointer-events:auto;
      cursor:pointer;
    ">
      ${discSvg}
      ${contentHtml}
    </div>`;

  const html = `<div style="transform:translate(-50%,-100%) scale(1.09);transform-origin:50% 100%;display:inline-block;">${pillHtml}</div>`;

  const icon = L.divIcon({
    className: 'custom-marker property-marker property-marker--selected',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

/**
 * Issue #2296 (PR #2381 third review) — Level-2 agri destination-bucket
 * marker icon: a compact evergreen parcel-count badge with the destination
 * name in a chip underneath (the approved look — see
 * docs/design/retrends-design-system/ui_kits/agri-discovery/AgriMap.jsx's
 * `clusterHTML`, which uses the evergreen family #1C5B43/#1F7A5C/#2E9B74).
 * Renders the bucket's `displayName` + authoritative `parcelCount` (from
 * `AgriDestinationBucket.parcelCount`, threaded through unchanged — never a
 * synthetic cluster-child count).
 *
 * All colour/shape styling lives in the `.agri-destination-marker-*` CSS
 * classes in src/index.css, which reuse the app's EXISTING ReTrends
 * --evergreen / --evergreen-foreground / --evergreen-tint / --card /
 * --foreground tokens (already defined in :root and already consumed
 * elsewhere as hsl(var(--evergreen)) — see JourneySwitcher.tsx,
 * PropertyCard.tsx) rather than a second hardcoded agri palette — this
 * function only interpolates the escaped text content, no hex/rgba/hsl
 * embedded here.
 *
 * Used ONLY by AgriDestinationMarkerLayer (a dedicated, non-clustering
 * layer), never by AgriMarkerClusterLayer; real Level-3 parcel listings keep
 * using createMarkerIcon / createSelectedMarkerIcon exactly as before,
 * untouched by this function.
 */
export const createAgriDestinationBadgeIcon = (
  displayName: string,
  parcelCount: number,
  isHighlighted: boolean,
): L.DivIcon => {
  const cacheKey = `agri-destination|${displayName}|${parcelCount}|${isHighlighted ? 'selected' : 'default'}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const safeName = escapeHtml(displayName);
  const parcelLabel = `${parcelCount} ${parcelCount === 1 ? 'parcel' : 'parcels'}`;
  const badgeModifier = isHighlighted ? ' agri-destination-marker-badge--selected' : '';

  const html = `
    <div class="agri-destination-marker" data-testid="agri-destination-marker" aria-label="${escapeHtml(`${displayName}, ${parcelLabel}`)}">
      <div class="agri-destination-marker-badge${badgeModifier}">${parcelCount}</div>
      <div class="agri-destination-marker-name">${safeName}</div>
    </div>`;

  const icon = L.divIcon({
    className: '',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};
