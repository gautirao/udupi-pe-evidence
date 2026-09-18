import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import { markerShellHtml, homeGlyphSvg } from '@/components/map/markerPrimitives';
import { PAPER, COPPER_500, GREY_500, GREY_700, NAVY_800, FONT_SANS, FONT_MONO } from '@/components/map/markerTokens';
import { AREA_CARD_FOOTPRINT_WIDTH_PX } from '@/features/discover/navigation/areaClustering';

/**
 * Issue #2456 — one nearby-suggestion candidate callout for the AREA_SET
 * draft editor, as the map sees it.
 *
 * Built 1:1 from the nearby-candidates contract (`NearbyAreaCandidate`) by
 * DiscoverMapCanvas, from the SAME `AreaSetDraftContext.data.candidates` array
 * `AreaSetDraftPanel` renders its suggestion rows from — so the number of
 * callouts on the map equals the number of rows in the panel, and `count` is
 * the panel's filter-aware `eligibleListingCount`, by construction rather
 * than by two derivations that happen to agree.
 *
 * Positions are never fabricated: lat/lon are the candidate's own
 * `geoCenterLat`/`geoCenterLon` from the backend contract.
 */
export interface AreaSetCandidateCallout {
  areaKey: string;
  label: string;
  lat: number;
  lon: number;
  /** Filter-aware eligible listing count — the panel row's number. */
  count: number;
}

/**
 * Issue #2456 (owner ruling C2) — one AREA_SET draft MEMBER as the map sees
 * it: after the panel's Add, the candidate's dashed callout is replaced by
 * the app's existing canonical WHITE selected "View homes" area card — the
 * same shared `markerShellHtml` shell (`isSelected: true`) behind the
 * `area-single-marker` navigation leaf card, i.e. the frozen mock's
 * `areaPinHTML` selected branch — rendered NON-INTERACTIVE. Geo centre and
 * label come from `useDiscoverAreas` (the member's own area record).
 * Issue #2616: displays listing count and school count when available on the area card,
 * or falls back to "Selected · in your draft" when counts are omitted.
 */
export interface AreaSetDraftMemberMarker {
  areaKey: string;
  label: string;
  lat: number;
  lon: number;
  count?: number;
  schoolCount?: number;
}

interface AreaSetCandidateCalloutLayerProps {
  candidates: AreaSetCandidateCallout[];
  /** Draft members (owner ruling C2). Optional so the callout-only contract is unchanged. */
  members?: AreaSetDraftMemberMarker[];
}

const NO_MEMBERS: AreaSetDraftMemberMarker[] = [];
const FONT_SANS_ATTR = escapeHtml(FONT_SANS);
const FONT_MONO_ATTR = escapeHtml(FONT_MONO);
/** Secondary line when counts are not provided. */
export const DRAFT_MEMBER_SECONDARY_TEXT = 'Selected · in your draft';

/**
 * Reuses `markerShellHtml` — the exact shell `makeSingleAreaChildCard` and
 * `makeDestinationCard` paint — with `isSelected: true` and
 * `interactive: false` (`pointer-events:none`, no cursor), and shell attrs
 * WITHOUT `tabindex`/`role`/`aria-label` (`aria-hidden`; the panel is the
 * accessible surface). Identity: pin + name + count/school or draft wording; footer:
 * the selected card's "View homes ›". Width = the leaf card's footprint.
 */
export function makeAreaSetDraftMemberIcon(member: AreaSetDraftMemberMarker): L.DivIcon {
  const label = escapeHtml(member.label);
  const nameMaxWidthPx = AREA_CARD_FOOTPRINT_WIDTH_PX - 24 - 11 - 6 - 2;
  const countVal = member.count;
  const countHtml =
    countVal != null
      ? `<span style="display:flex;align-items:baseline;gap:4px;margin-top:4px;"><span style="font-family:${FONT_MONO_ATTR};font-size:18px;font-weight:800;letter-spacing:-0.02em;line-height:1;color:${NAVY_800};">${countVal.toLocaleString()}</span><span style="font-family:${FONT_SANS_ATTR};font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${GREY_500};">${countVal === 1 ? 'LISTING' : 'LISTINGS'}</span></span>`
      : '';
  const schoolHtml =
    member.schoolCount != null
      ? `<span style="margin-top:2px;font-family:${FONT_SANS_ATTR};font-size:10.5px;font-weight:600;color:${GREY_700};white-space:nowrap;">${member.schoolCount} ${member.schoolCount === 1 ? 'school' : 'schools'}</span>`
      : '';
  const hasCounts = countVal != null;
  const secondaryHtml = hasCounts
    ? `${countHtml}${schoolHtml}`
    : `<span data-testid="area-set-draft-member-secondary" style="margin-top:6px;font-size:11px;font-weight:600;color:${GREY_500};">${DRAFT_MEMBER_SECONDARY_TEXT}</span>`;

  const identityHtml =
    `<span style="display:flex;align-items:center;gap:6px;max-width:100%;">` +
    pinSvg(COPPER_500) +
    `<span style="font-size:13.5px;font-weight:800;letter-spacing:-0.01em;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${nameMaxWidthPx}px;">${label}</span>` +
    `</span>` +
    secondaryHtml;
  const html = markerShellHtml({
    shellAttrs: `data-testid="area-set-draft-member-marker" data-node-key="${escapeHtml(member.areaKey)}" data-selected="true" data-interactive="false" aria-hidden="true"`,
    titleAttr: '',
    actionKind: 'view-homes',
    journey: 'areas',
    widthPx: AREA_CARD_FOOTPRINT_WIDTH_PX,
    isSelected: true,
    interactive: false,
    journeyAttr: '',
    fontSansAttr: FONT_SANS_ATTR,
    identityHtml,
    footerIconHtml: homeGlyphSvg(PAPER),
    footerLabelText: 'View homes',
  });
  return L.divIcon({ className: 'area-set-draft-member-marker-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

// ReTrends palette literals — divIcon HTML is not processed by Tailwind/CSS
// vars (same documented exception AreaMarkerLayer.tsx takes for its own
// C_* constants). Values mirror the frozen mock's tokens:
//   --grey-500 → pin glyph, --text-body → label, --text-muted → count,
//   --border-strong → dashed border, --shadow-xs → shadow.
const C_GREY_500 = '#6B7280';
const C_TEXT_BODY = '#374151';
const C_TEXT_MUTED = '#6B7280';
const C_BORDER_STRONG = '#9CA3AF';
const SHADOW_XS = '0 1px 2px rgba(17,24,39,0.06)';
const MONO = `'Geist Mono', ui-monospace, 'SF Mono', monospace`;

const pinSvg = (color: string) =>
  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

/**
 * Frozen-mock treatment (docs/design/retrends-design-system/ui_kits/
 * new_discover/src/ExpMap.jsx `areaPinHTML`, `candidate` branch): a subtle
 * DASHED label pill — "must never read as a committed search area". No
 * `role="button"`, no `tabindex`, `pointer-events:none`: the callout is a
 * read-only annotation of what the panel is offering, never an action.
 * Anchoring mirrors the mock (`transform:translateY(-100%)` on a centred
 * 210px box): bottom-centre of the pill sits on the geo centre.
 */
export function makeAreaSetCandidateCalloutIcon(candidate: AreaSetCandidateCallout): L.DivIcon {
  const label = escapeHtml(candidate.label);
  const count = candidate.count.toLocaleString();
  const html = `<div data-testid="area-set-candidate-callout" data-area-key="${escapeHtml(candidate.areaKey)}" data-design-component="area-candidate-label" aria-hidden="true" style="position:relative;width:210px;margin-left:-105px;transform:translateY(-100%);text-align:center;font-family:inherit;pointer-events:none;user-select:none;">
    <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,0.88);color:${C_TEXT_BODY};border:1px dashed ${C_BORDER_STRONG};box-shadow:${SHADOW_XS};white-space:nowrap;font-size:11.5px;font-weight:600;">
      ${pinSvg(C_GREY_500)}${label}<span style="font-family:${MONO};font-size:10.5px;color:${C_TEXT_MUTED};">${count}</span>
    </span>
  </div>`;
  return L.divIcon({
    className: 'area-set-candidate-callout',
    html,
    iconSize: undefined,
    iconAnchor: [0, 0],
  });
}

/**
 * AreaSetCandidateCalloutLayer — Issue #2456.
 *
 * Renders the AREA_SET draft's nearby-suggestion candidates as NON-INTERACTIVE
 * dashed callouts while the draft editor is open. The parent
 * (DiscoverMapCanvas) supplies an empty array whenever the draft is closed,
 * which tears every callout down.
 *
 * Why a dedicated layer rather than the AreaMarkerLayer candidate-card path:
 * nearby candidates are, by definition, OUTSIDE the committed scope, so they
 * are not in AreaMarkerLayer's `areas` input at all in the committed-area
 * state, and when they were present they were bucketed into dots/cluster
 * chips by `computeAreaMarkers` at every reached zoom — the card never
 * rendered (issue #2456 body, PR #2453 evidence). This layer takes the
 * candidates' own geo centres and never enters the bucketing pass, so it is
 * visible regardless of zoom and regardless of which primary marker layer
 * (area / destination / residential listings) currently owns the map, and
 * it cannot disturb the bucketing of real areas.
 *
 * Owner ruling (#2456): callouts are not committed areas, hierarchy nodes,
 * clickable Preview actions or new result scopes. `interactive: false` +
 * `keyboard: false` on the Leaflet marker and `pointer-events:none` on the
 * icon mean no click/hover/keyboard handler exists to change scope; adding a
 * candidate happens only through the panel's Add → Show listings path.
 */
export function AreaSetCandidateCalloutLayer({
  candidates,
  members = NO_MEMBERS,
}: AreaSetCandidateCalloutLayerProps) {
  const map = useMap();

  useEffect(() => {
    const markers: L.Marker[] = [];

    for (const candidate of candidates) {
      const marker = L.marker([candidate.lat, candidate.lon], {
        icon: makeAreaSetCandidateCalloutIcon(candidate),
        interactive: false,
        keyboard: false,
        // Sit above listing pins / area cards so the suggestion reads
        // clearly, matching SchoolZoneLabelLayer's own lift.
        zIndexOffset: 1000,
      });
      marker.addTo(map);
      markers.push(marker);
    }

    // Issue #2456 (owner ruling C2) — draft members as the canonical white
    // selected card, on the same non-interactive Leaflet contract as the
    // callouts: no handler is ever registered, so Add stays draft-only
    // (Show/Search remains the commit) and nothing on the map mutates scope.
    for (const member of members) {
      const marker = L.marker([member.lat, member.lon], {
        icon: makeAreaSetDraftMemberIcon(member),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      });
      marker.addTo(map);
      markers.push(marker);
    }

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [candidates, members, map]);

  return null;
}
