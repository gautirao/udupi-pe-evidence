import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PropertyListing, PropertyType } from '@/hooks/usePropertyListings';
import { formatPrice } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Home, MapPin, Ruler, Calendar } from 'lucide-react';
import { format } from 'date-fns';

// Fix default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Udupi district center
const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];
const DEFAULT_ZOOM = 11;

// Custom marker icons by property type
const createMarkerIcon = (propertyType: PropertyType) => {
  const colors: Record<PropertyType, string> = {
    land: '#22c55e',
    house: '#ea580c',
    apartment: '#8b5cf6',
    commercial: '#3b82f6',
    other: '#6b7280',
  };

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background-color: ${colors[propertyType]};
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          transform: rotate(45deg);
          color: white;
          font-size: 12px;
          font-weight: bold;
        ">${propertyType[0].toUpperCase()}</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

// Cluster icon
const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  let size: 'small' | 'medium' | 'large' = 'small';
  if (count > 10) size = 'medium';
  if (count > 50) size = 'large';

  const sizes = {
    small: 36,
    medium: 44,
    large: 52,
  };

  return L.divIcon({
    html: `<div class="custom-marker-cluster" style="width: ${sizes[size]}px; height: ${sizes[size]}px;">${count}</div>`,
    className: '',
    iconSize: L.point(sizes[size], sizes[size]),
  });
};

interface PropertyMapProps {
  listings: PropertyListing[];
  selectedListing?: PropertyListing | null;
  onSelectListing?: (listing: PropertyListing | null) => void;
}

function MapController({ selectedListing }: { selectedListing?: PropertyListing | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedListing?.latitude && selectedListing?.longitude) {
      map.flyTo([selectedListing.latitude, selectedListing.longitude], 15, {
        duration: 1,
      });
    }
  }, [selectedListing, map]);

  return null;
}

export function PropertyMap({ listings, selectedListing, onSelectListing }: PropertyMapProps) {
  const markers = useMemo(() => {
    return listings
      .filter((listing) => listing.latitude && listing.longitude)
      .map((listing) => ({
        listing,
        position: [listing.latitude!, listing.longitude!] as [number, number],
        icon: createMarkerIcon(listing.property_type),
      }));
  }, [listings]);

  const propertyTypeLabels: Record<PropertyType, string> = {
    land: 'Land',
    house: 'House',
    apartment: 'Apartment',
    commercial: 'Commercial',
    other: 'Other',
  };

  const propertyTypeColors: Record<PropertyType, string> = {
    land: 'bg-green-500',
    house: 'bg-orange-500',
    apartment: 'bg-violet-500',
    commercial: 'bg-blue-500',
    other: 'bg-gray-500',
  };

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={UDUPI_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full rounded-lg z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController selectedListing={selectedListing} />
        
        {markers.map(({ listing, position, icon }) => (
          <Marker
            key={listing.id}
            position={position}
            icon={icon}
            eventHandlers={{
              click: () => onSelectListing?.(listing),
            }}
          >
            <Popup>
              <div className="min-w-[200px] max-w-[280px]">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={`${propertyTypeColors[listing.property_type]} text-white`}>
                    {propertyTypeLabels[listing.property_type]}
                  </Badge>
                  {listing.confidence_score && listing.confidence_score < 70 && (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                      Low confidence
                    </Badge>
                  )}
                </div>

                {listing.price && (
                  <p className="text-lg font-bold text-primary mb-2">
                    {formatPrice(listing.price, listing.price_unit)}
                  </p>
                )}

                {listing.locality && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{listing.locality}</span>
                  </div>
                )}

                {listing.land_area && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                    <Ruler className="h-3.5 w-3.5" />
                    <span>{listing.land_area} {listing.land_area_unit || 'sq ft'}</span>
                  </div>
                )}

                {listing.property_type === 'house' && listing.bedrooms && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                    <Home className="h-3.5 w-3.5" />
                    <span>{listing.bedrooms} BHK</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 pt-2 border-t">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(listing.created_at), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 left-4 z-[1000] p-3 bg-card/95 backdrop-blur">
        <p className="text-xs font-medium mb-2 text-muted-foreground">Property Types</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(propertyTypeLabels).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className={`w-3 h-3 rounded-full ${propertyTypeColors[type as PropertyType]}`}
              />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}