import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, CATEGORY_ICONS, SETTLEMENT_CATEGORIES, formatDistance } from '@/lib/poi-categories';

interface PoiResponse {
  id: string;
  name: string;
  category: string;
  distanceMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  pinned: boolean;
  approved: boolean;
}

interface PoiMiniMapProps {
  listingId: string;
  latitude: number;
  longitude: number;
  propertyType?: string;
}

const ZOOM_BY_TYPE: Record<string, number> = {
  land: 11,
  'house-rural': 12,
  commercial: 13,
};

const CATEGORY_COLORS: Record<string, string> = {
  WORSHIP: '#f97316',
  HOSPITAL: '#ef4444',
  SCHOOL: '#3b82f6',
  HOTEL: '#8b5cf6',
  TRANSPORT: '#06b6d4',
  AIRPORT: '#64748b',
  GROCERY: '#22c55e',
};

const DEFAULT_COLOR = '#6b7280';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createListingIcon(): L.DivIcon {
  return L.divIcon({
    className: 'listing-pin',
    html: `<div style="
      width:32px;height:32px;
      background:#1e293b;
      border:2px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;line-height:1;
    ">🏠</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createPoiIcon(category: string): L.DivIcon {
  const color = CATEGORY_COLORS[category] ?? DEFAULT_COLOR;
  const emoji = CATEGORY_ICONS[category] ?? '📍';
  return L.divIcon({
    className: 'poi-pin',
    html: `<div style="
      width:24px;height:24px;
      background:${color};
      border:2px solid white;
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:12px;line-height:1;
    ">${emoji}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createDistanceIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: 'distance-label',
    html: `<div style="
      background:rgba(255,255,255,0.9);
      border:1px solid #cbd5e1;
      border-radius:4px;
      padding:1px 4px;
      font-size:10px;
      font-weight:600;
      color:#334155;
      white-space:nowrap;
      box-shadow:0 1px 3px rgba(0,0,0,0.15);
    ">${label}</div>`,
    iconSize: [60, 20],
    iconAnchor: [30, 10],
  });
}

function createTownIcon(): L.DivIcon {
  return L.divIcon({
    className: 'town-pin',
    html: `<div style="width:28px;height:28px;background:#1e40af;border:2px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">🏙</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

interface MappablePoi extends PoiResponse {
  latitude: number;
  longitude: number;
}

export function PoiMiniMap({ listingId, latitude, longitude, propertyType }: PoiMiniMapProps) {
  const [visible, setVisible] = useState(propertyType === 'land');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pois', listingId],
    queryFn: () => api.get<PoiResponse[]>(`/api/listings/${listingId}/pois`),
  });

  if (isLoading || isError) return null;

  const zoom = ZOOM_BY_TYPE[propertyType ?? ''] ?? 15;

  const mappable: MappablePoi[] = (data ?? [])
    .filter(
      (p): p is MappablePoi =>
        p.latitude != null && p.longitude != null && !SETTLEMENT_CATEGORIES.has(p.category),
    );

  // Find nearest town for land maps — rendered as a blue reference marker with dashed polyline
  const landTown = (data ?? [])
    .filter(
      (p): p is MappablePoi =>
        p.category === 'TOWN_CENTER' && p.latitude != null && p.longitude != null,
    )
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))[0] as
    | MappablePoi
    | undefined;

  if (mappable.length === 0 && !landTown) return null;

  const listingIcon = createListingIcon();

  return (
    <div>
      {/* Mobile toggle — visible only below md breakpoint */}
      <button
        type="button"
        className="md:hidden mb-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? 'Hide Map' : 'Show Map'}
      </button>

      {/* Map wrapper — hidden on mobile unless toggled; always visible on md+ */}
      <div
        className={
          visible
            ? 'h-[350px] rounded-lg overflow-hidden'
            : 'h-[350px] rounded-lg overflow-hidden hidden md:block'
        }
        style={{ height: '350px' }}
      >
        <MapContainer
          center={[latitude, longitude]}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Listing marker */}
          <Marker position={[latitude, longitude]} icon={listingIcon} />

          {/* Nearest town: dashed blue polyline + blue marker with permanent tooltip */}
          {landTown && (
            <React.Fragment>
              <Polyline
                positions={[
                  [latitude, longitude],
                  [landTown.latitude, landTown.longitude],
                ]}
                pathOptions={{ color: '#1e40af', weight: 2, dashArray: '6 3' }}
              />
              <Marker
                position={[landTown.latitude, landTown.longitude]}
                icon={createTownIcon()}
              >
                <Tooltip permanent direction="top">
                  <span>{landTown.name}</span>
                </Tooltip>
              </Marker>
            </React.Fragment>
          )}

          {/* Per-POI: polyline + midpoint distance label + POI marker with tooltip */}
          {mappable.map((poi) => {
            const color = CATEGORY_COLORS[poi.category] ?? DEFAULT_COLOR;
            const distMeters =
              poi.distanceMeters != null
                ? poi.distanceMeters
                : haversine(latitude, longitude, poi.latitude, poi.longitude);
            const distLabel = formatDistance(distMeters);
            const midLat = (latitude + poi.latitude) / 2;
            const midLon = (longitude + poi.longitude) / 2;
            const poiIcon = createPoiIcon(poi.category);
            const distIcon = createDistanceIcon(distLabel);
            const categoryLabel = CATEGORY_LABELS[poi.category] ?? poi.category;

            return (
              <React.Fragment key={poi.id}>
                <Polyline
                  positions={[
                    [latitude, longitude],
                    [poi.latitude, poi.longitude],
                  ]}
                  pathOptions={{ color, weight: 2, dashArray: '4 4' }}
                />
                <Marker position={[midLat, midLon]} icon={distIcon} />
                <Marker position={[poi.latitude, poi.longitude]} icon={poiIcon}>
                  <Tooltip permanent={false} direction="top">
                    <div>
                      <p className="font-medium">{poi.name}</p>
                      <p className="text-xs text-muted-foreground">{categoryLabel}</p>
                      <p className="text-xs">{distLabel}</p>
                    </div>
                  </Tooltip>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        &copy;{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>{' '}
        contributors (ODbL)
      </p>
    </div>
  );
}
