import { useEffect } from 'react';
import { useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import { CLUSTER_DISABLE_AT_ZOOM, CLUSTER_MAX_RADIUS_PX } from '@/lib/map/zoomPolicy';
import { computeCoincidentMarkerOffsets } from '@/shared/map/zoomPolicy';
import type { PropertyListingWithImages } from '../PropertyMap';
import { createMarkerIcon, createSelectedMarkerIcon } from './markerIcons';

/**
 * Issue #2382 — agri Level-3 real-parcel layers, extracted verbatim out of
 * PropertyMap.tsx (page-health follow-up from #2296). Owns real Level-3
 * parcel-listing clustering (AgriMarkerClusterLayer) and the boundary
 * polygon overlay (AgriPolygonLayer) — the two layers that render actual
 * agricultural parcels (as opposed to AgriDestinationMarkerLayer's Level-2
 * destination-bucket badges, which live in their own module). No behaviour
 * change.
 */

/**
 * Issue #1465 — Build a safe hover-tooltip label for an agri map marker.
 *
 * Priority: escaped title → locality + acreage fallback → acreage only →
 * generic. Never returns "undefined", "null", or an empty string.
 *
 * Exported for unit testing; not part of the public component API.
 */
export function buildAgriMarkerLabel(
  title: string | null | undefined,
  locality: string | null | undefined,
  landArea: number | null | undefined,
  landAreaUnit: string | null | undefined,
): string {
  // Title takes priority when non-blank.
  if (title != null && title.trim() !== '') {
    return escapeHtml(title.trim());
  }

  // Derive a human-readable acreage string when possible.
  const hasAcreage = landArea != null && landArea > 0;
  const unit = landAreaUnit ?? 'acres';
  const acreageStr = hasAcreage ? `${landArea} ${escapeHtml(unit)}` : null;

  const hasLocality = locality != null && locality.trim() !== '';
  const localityStr = hasLocality ? escapeHtml(locality!.trim()) : null;

  if (localityStr && acreageStr) return `${localityStr} · ${acreageStr}`;
  if (acreageStr) return acreageStr;
  if (localityStr) return localityStr;
  return 'Agricultural land';
}

// Issue #1372 — agriculture-specific cluster layer.
// Identical structure to MarkerClusterLayer but uses agri-themed cluster icons
// so agricultural land pins are visually distinct in the agri-first journey.
export function AgriMarkerClusterLayer({
  listings,
  onSelectListing,
  selectedListingId,
  hoveredListingId,
}: {
  listings: PropertyListingWithImages[];
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  /** Issue #1547 — ID of the currently selected agri listing (URL-derived). Renders copper icon. */
  selectedListingId?: string | null;
  /** Issue #1547 — ephemeral hover/focus id for agri card→marker highlight. */
  hoveredListingId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: CLUSTER_MAX_RADIUS_PX,
      disableClusteringAtZoom: CLUSTER_DISABLE_AT_ZOOM,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size: 'small' | 'medium' | 'large' = 'small';
        let sizeNum = 36;

        if (count > 50) {
          size = 'large';
          sizeNum = 52;
        } else if (count > 10) {
          size = 'medium';
          sizeNum = 44;
        }

        return L.divIcon({
          html: `<div class="agri-cluster agri-cluster-${size}">🌾 ${count} ${count === 1 ? 'property' : 'properties'}</div>`,
          className: '',
          iconSize: undefined,
          iconAnchor: [0, 0],
        });
      },
    });

    const validListings = listings.filter((l) => l.latitude && l.longitude);

    // Issue #2139 — coincident-coordinate separation (zoomPolicy.ts). Same
    // root cause as MarkerClusterLayer's identically-named block: this
    // layer uses the SAME disableClusteringAtZoom/maxClusterRadius constants,
    // so agri listings sharing (near-)identical fallback-tier geocoded
    // coordinates are equally exposed once zoom crosses that threshold.
    // Unlike MarkerClusterLayer, this layer has no clusterCanSplit/
    // cluster-tap split-decision path (zoomToBoundsOnClick stays Leaflet's
    // own default `true` here, and no rawLatLngByMarker-style raw-coordinate
    // lookup exists) — verified via jCodemunch that AgriMarkerClusterLayer
    // never references clusterCanSplit, so there is no split decision this
    // render-position offset could disturb. `!` is required here for the
    // same reason as MarkerClusterLayer: validListings is already
    // runtime-filtered to truthy latitude/longitude above, but the type
    // still carries them as nullable.
    const coincidentOffsets = computeCoincidentMarkerOffsets(
      validListings.map((l) => ({ id: l.id, latitude: l.latitude!, longitude: l.longitude! })),
    );

    validListings.forEach((listing) => {
      const isHighlighted =
        listing.id === selectedListingId || listing.id === hoveredListingId;
      // Issue #1942 — pass priceBand for signature consistency with MarkerClusterLayer.
      // Agri listings never carry a priceBand (null), so this branch stays byte-identical
      // '—' — the same shared helper is just called with an always-absent 3rd arg here.
      // Issue #2296 (PR #2381 second review) — Level-2 destination-bucket markers no
      // longer flow through this layer at all (see AgriDestinationMarkerLayer, wired
      // via the dedicated `agriDestinationMarkers` prop). This layer is used ONLY for
      // real Level-3 parcel listings, so its icon selection is back to exactly its
      // pre-#2296 form — no parcelCount branching here.
      const icon = isHighlighted
        ? createSelectedMarkerIcon(listing.property_type, listing.price, listing.priceBand)
        : createMarkerIcon(listing.property_type, listing.price, listing.priceBand);
      // Issue #2139 — render at the coincident-offset position (identical
      // to the raw listing coordinates for any non-coincident listing).
      const position = coincidentOffsets.get(listing.id) ?? { latitude: listing.latitude!, longitude: listing.longitude! };
      const marker = L.marker([position.latitude, position.longitude], { icon });

      // Attach listing-id to the marker element for E2E selectors.
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.setAttribute('data-listing-id', listing.id);
      });

      marker.on('click', () => {
        onSelectListing?.(listing);
      });

      // Issue #1465 — lightweight hover tooltip; orthogonal to click handler.
      const tooltipLabel = buildAgriMarkerLabel(
        listing.title,
        listing.locality,
        listing.land_area,
        listing.land_area_unit,
      );
      marker.bindTooltip(tooltipLabel, {
        permanent: false,
        direction: 'top',
        offset: [0, -20],
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [listings, map, onSelectListing, selectedListingId, hoveredListingId]);

  return null;
}

/**
 * Issue #1373 — renders saved agricultural plot boundaries as Leaflet Polygons.
 *
 * Only active when:
 *   - mapZoom >= 16 (same threshold as AgriMarkerClusterLayer.disableClusteringAtZoom)
 *   - listing.boundary_geojson is a non-null, non-empty string
 *
 * Coordinate transform: GeoJSON stores [longitude, latitude] pairs; Leaflet uses
 * [latitude, longitude]. This component converts on-the-fly when building positions.
 * The fails-without-fix unit test in PropertyMap.agriPolygon.test.tsx asserts this.
 *
 * Null-boundary agri listings fall back to AgriMarkerClusterLayer (no polygon here).
 * Non-agri listings are not passed to this layer (AgriPolygonLayer only mounts in isAgriMode).
 */
export function AgriPolygonLayer({
  listings,
  selectedListing,
  onSelectListing,
  mapZoom,
}: {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  mapZoom?: number;
}) {
  // Gate: only render at zoom >= 16
  if (mapZoom == null || mapZoom < 16) return null;

  const agriListingsWithBoundary = listings.filter(
    (l) => l.property_type === 'agricultural_land' && l.boundary_geojson,
  );

  if (agriListingsWithBoundary.length === 0) return null;

  return (
    <>
      {agriListingsWithBoundary.map((listing) => {
        let positions: [number, number][] = [];
        try {
          // GeoJSON Polygon: { type: "Polygon", coordinates: [[[lng, lat], ...]] }
          // Leaflet Polygon positions: [[lat, lng], ...]
          // Transform: each [lng, lat] pair → [lat, lng]
          const geo = JSON.parse(listing.boundary_geojson!);
          // Guard: only handle GeoJSON Polygon type
          if (geo.type !== 'Polygon' || !Array.isArray(geo.coordinates?.[0])) return null;
          const ring: [number, number][] = geo.coordinates[0];
          positions = ring.map(([lng, lat]: [number, number]) => [lat, lng]);
        } catch {
          return null;
        }
        if (positions.length < 3) return null;

        const isSelected = selectedListing?.id === listing.id;

        return (
          <Polygon
            key={listing.id}
            positions={positions}
            pathOptions={{
              color: isSelected ? '#f97316' : '#65a30d',
              fillColor: isSelected ? '#f97316' : '#65a30d',
              fillOpacity: isSelected ? 0.35 : 0.2,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{
              click: () => onSelectListing?.(listing),
            }}
          />
        );
      })}
    </>
  );
}
