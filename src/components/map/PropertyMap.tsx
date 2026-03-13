import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { PropertyListing, PropertyType, PropertyImage } from '@/hooks/usePropertyListings';
import { Card } from '@/components/ui/card';

// Extended listing with images for map display
export interface PropertyListingWithImages extends PropertyListing {
  images?: PropertyImage[];
}

// Fix default marker icons in Leaflet
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Udupi district center
const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];
const DEFAULT_ZOOM = 11;

// Property type configuration
const propertyConfig: Record<PropertyType, { color: string; label: string; bgClass: string }> = {
  land: { color: '#22c55e', label: 'Land', bgClass: 'bg-green-500' },
  house: { color: '#ea580c', label: 'House', bgClass: 'bg-orange-500' },
  apartment: { color: '#8b5cf6', label: 'Apartment', bgClass: 'bg-violet-500' },
  commercial: { color: '#3b82f6', label: 'Commercial', bgClass: 'bg-blue-500' },
  commercial_building: { color: '#2563eb', label: 'Comm. Building', bgClass: 'bg-blue-600' },
  warehouse: { color: '#d97706', label: 'Warehouse', bgClass: 'bg-amber-600' },
  commercial_land: { color: '#0d9488', label: 'Comm. Land', bgClass: 'bg-teal-600' },
  other: { color: '#6b7280', label: 'Other', bgClass: 'bg-gray-500' },
};

// Create custom marker icon
const createMarkerIcon = (propertyType: PropertyType) => {
  const { color } = propertyConfig[propertyType];
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background-color: ${color};
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
  });
};

interface PropertyMapProps {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  focusBounds?: [[number, number], [number, number]] | null;
}

function MapController({
  selectedListing,
  focusBounds,
}: {
  selectedListing?: PropertyListing | null;
  focusBounds?: [[number, number], [number, number]] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedListing?.latitude && selectedListing?.longitude) {
      map.flyTo([selectedListing.latitude, selectedListing.longitude], 15, {
        duration: 1,
      });
    }
  }, [selectedListing, map]);

  useEffect(() => {
    if (!focusBounds) return;
    const [[s, w], [n, e]] = focusBounds;
    if (s === n && w === e) {
      // Single point — fitBounds on a zero-area bounds is degenerate; use flyTo
      map.flyTo([s, w], 15, { duration: 1 });
    } else {
      map.fitBounds(focusBounds, { padding: [50, 50] });
    }
  }, [focusBounds, map]);

  return null;
}

// Marker cluster layer component
function MarkerClusterLayer({ 
  listings, 
  onSelectListing 
}: { 
  listings: PropertyListingWithImages[]; 
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    // Create cluster group with custom options
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 50,
      disableClusteringAtZoom: 16,
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
          html: `<div class="custom-marker-cluster custom-marker-cluster-${size}">${count}</div>`,
          className: '',
          iconSize: L.point(sizeNum, sizeNum),
        });
      },
    });

    // Add markers to cluster group
    const validListings = listings.filter(l => l.latitude && l.longitude);
    
    validListings.forEach((listing) => {
      const marker = L.marker(
        [listing.latitude!, listing.longitude!],
        { icon: createMarkerIcon(listing.property_type) }
      );
      
      marker.on('click', () => {
        onSelectListing?.(listing);
      });
      
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    // Cleanup
    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [listings, map, onSelectListing]);

  return null;
}

export function PropertyMap({ listings, selectedListing, onSelectListing, focusBounds }: PropertyMapProps) {
  const listingsWithCoords = useMemo(() => {
    return listings.filter((listing) => listing.latitude && listing.longitude);
  }, [listings]);

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
        <MapController selectedListing={selectedListing} focusBounds={focusBounds} />
        <MarkerClusterLayer listings={listings} onSelectListing={onSelectListing} />
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 left-4 z-[1000] p-3 bg-card/95 backdrop-blur">
        <p className="text-xs font-medium mb-2 text-muted-foreground">Property Types</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(propertyConfig).map(([type, { label, bgClass }]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${bgClass}`} />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
        {listingsWithCoords.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
            {listingsWithCoords.length} properties on map
          </p>
        )}
      </Card>
    </div>
  );
}
