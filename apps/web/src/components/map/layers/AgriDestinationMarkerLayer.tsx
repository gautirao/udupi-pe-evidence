import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import { createAgriDestinationBadgeIcon } from './markerIcons';

/**
 * Issue #2382 — agri Level-2 destination-bucket marker layer, extracted
 * verbatim out of PropertyMap.tsx (page-health follow-up from #2296).
 *
 * Originally added by issue #2296 (PR #2381 second review) as a dedicated
 * Level-2 agri destination-bucket marker layer.
 *
 * Deliberately does NOT use `L.markerClusterGroup` (unlike AgriMarkerClusterLayer
 * in AgriParcelLayer.tsx, which is for real Level-3 parcel listings and is
 * UNCHANGED by this component). Level-2 destination buckets each carry their
 * own authoritative name + parcelCount; if two nearby buckets were clustered
 * by the generic marker-cluster policy, Leaflet's `iconCreateFunction` would
 * collapse them into a "N properties" bubble showing the number of clustered
 * MARKERS (towns), not parcels — silently recreating the exact
 * identity/count ambiguity #2296 exists to remove. Rendering every
 * destination as a plain `L.marker` in an `L.layerGroup` guarantees each one
 * always shows its own name + count, at every zoom level, with no
 * clustering branch to regress.
 *
 * Items without a defined `parcelCount` are skipped — this layer only ever
 * renders authoritative Level-2 destination buckets (see
 * useAgriDestinationMarkers, which populates parcelCount and already drops
 * zero-count buckets before this layer ever sees them).
 */
export function AgriDestinationMarkerLayer({
  destinations,
  onSelectAgriDestination,
  selectedListingId,
  hoveredListingId,
}: {
  destinations: AgriMapListingItem[];
  /**
   * Issue #2296 (PR #2381 third review) — fired with the clicked bucket's
   * stable `areaKey`. NOT the generic `onSelectListing` marker-popover flow:
   * a destination-bucket marker represents a town/locality, not a single
   * listing, so clicking it must drill down (`urlActions.setLocality`), the
   * same action AgriGroupSelectedPanel's locality-row click already uses —
   * not open a listing popover/preview.
   */
  onSelectAgriDestination?: (areaKey: string) => void;
  /** ID of the currently selected agri destination (URL-derived `listing`/areaKey). */
  selectedListingId?: string | null;
  /** Ephemeral hover/focus id for panel-row -> marker highlight. */
  hoveredListingId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const validDestinations = destinations.filter(
      (d): d is AgriMapListingItem & { latitude: number; longitude: number; parcelCount: number } =>
        d.latitude != null && d.longitude != null && d.parcelCount != null,
    );

    // No-op when there is nothing to render (the common case — most map
    // states are not Level-2 agri destinations). Skipping L.layerGroup()
    // entirely here also means this layer imposes zero cost/dependency on
    // every OTHER PropertyMap consumer (residential, school-first, Level-3
    // agri, etc.) that never populates `agriDestinationMarkers`.
    if (validDestinations.length === 0) return;

    const layerGroup = L.layerGroup();

    validDestinations.forEach((destination) => {
        const isHighlighted =
          destination.id === selectedListingId || destination.id === hoveredListingId;
        const icon = createAgriDestinationBadgeIcon(
          destination.title ?? destination.locality ?? 'Agricultural land',
          destination.parcelCount,
          isHighlighted,
        );
        const marker = L.marker([destination.latitude, destination.longitude], { icon });

        marker.on('add', () => {
          const el = marker.getElement();
          if (el) el.setAttribute('data-listing-id', destination.id);
        });

        marker.on('click', () => {
          // Stable identity: destination.areaKey is unchanged from the
          // authoritative AgriDestinationBucket (see useAgriDestinationMarkers).
          onSelectAgriDestination?.(destination.areaKey);
        });

        layerGroup.addLayer(marker);
      });

    map.addLayer(layerGroup);

    return () => {
      map.removeLayer(layerGroup);
    };
  }, [destinations, map, onSelectAgriDestination, selectedListingId, hoveredListingId]);

  return null;
}
