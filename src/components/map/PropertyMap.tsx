import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { PropertyListing, PropertyType, PropertyImage } from '@/hooks/usePropertyListings';
import { formatPrice } from '@/lib/formatters';
import { Card } from '@/components/ui/card';

// Extended listing with images for map display
export interface PropertyListingWithImages extends PropertyListing {
  images?: PropertyImage[];
}

/**
 * Escape HTML special characters to prevent XSS attacks.
 * Addresses SEC-3: Stored XSS vulnerability from Code Review Sprint.
 *
 * @param str - String that may contain user-controlled data
 * @returns Escaped string safe for HTML interpolation
 */
const escapeHtml = (str: string | null | undefined): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

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

// Property type configuration
const propertyConfig: Record<PropertyType, { color: string; label: string; bgClass: string }> = {
  land: { color: '#22c55e', label: 'Land', bgClass: 'bg-green-500' },
  house: { color: '#ea580c', label: 'House', bgClass: 'bg-orange-500' },
  apartment: { color: '#8b5cf6', label: 'Apartment', bgClass: 'bg-violet-500' },
  commercial: { color: '#3b82f6', label: 'Commercial', bgClass: 'bg-blue-500' },
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
    popupAnchor: [0, -32],
  });
};

// Create popup content
const createPopupContent = (listing: PropertyListingWithImages): string => {
  const { label } = propertyConfig[listing.property_type];
  const bgColor = propertyConfig[listing.property_type].color;
  const firstImage = listing.images?.[0]?.url;
  
  // Use the title from the listing, or generate one from available data
  const title = listing.title || (() => {
    const titleParts = [label];
    if (listing.land_area) {
      titleParts.push(`${listing.land_area} ${listing.land_area_unit || 'sq ft'}`);
    }
    if (listing.locality) {
      titleParts.push(`in ${listing.locality}`);
    }
    return titleParts.join(' ');
  })();
  
  let html = `
    <div style="min-width: 260px; max-width: 320px; font-family: system-ui, sans-serif;">
  `;
  
  // Thumbnail image at the top
  if (firstImage) {
    html += `
      <div style="margin: -10px -10px 10px -10px; border-radius: 8px 8px 0 0; overflow: hidden; height: 120px; background: #f1f5f9;">
        <img
          src="${escapeHtml(firstImage)}"
          alt="Property"
          style="width: 100%; height: 100%; object-fit: cover;"
          onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8;\\'>No image</div>';"
        />
      </div>
    `;
  }
  
  // Title
  html += `
    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #1e293b; line-height: 1.3;">
      ${escapeHtml(title)}
    </h3>
  `;
  
  html += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
        <span style="
          background-color: ${bgColor};
          color: white;
          padding: 2px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
        ">${label}</span>
  `;
  
  if (listing.confidence_score && listing.confidence_score < 70) {
    html += `
        <span style="
          border: 1px solid #facc15;
          color: #ca8a04;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 11px;
        ">Low confidence</span>
    `;
  }
  
  html += `</div>`;
  
  // Price - prominent display
  if (listing.price) {
    html += `
      <p style="font-size: 18px; font-weight: 700; color: #0ea5e9; margin: 0 0 10px 0;">
        ${formatPrice(listing.price, listing.price_unit)}
      </p>
    `;
  }
  
  // Property details grid
  html += `<div style="display: grid; gap: 6px; font-size: 13px; color: #64748b;">`;
  
  // Locality
  if (listing.locality) {
    html += `
      <div style="display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span>${escapeHtml(listing.locality)}</span>
      </div>
    `;
  }
  
  // Land area
  if (listing.land_area) {
    html += `
      <div style="display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/>
          <path d="m7.5 10.5 2 2"/>
          <path d="m10.5 7.5 2 2"/>
          <path d="m13.5 4.5 2 2"/>
          <path d="m4.5 13.5 2 2"/>
        </svg>
        <span>Land: ${listing.land_area} ${escapeHtml(listing.land_area_unit || 'sq ft')}</span>
      </div>
    `;
  }
  
  // Built area (for houses/apartments)
  if (listing.built_area && (listing.property_type === 'house' || listing.property_type === 'apartment')) {
    html += `
      <div style="display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="M3 9h18"/>
          <path d="M9 21V9"/>
        </svg>
        <span>Built: ${listing.built_area} ${escapeHtml(listing.built_area_unit || 'sq ft')}</span>
      </div>
    `;
  }
  
  // Bedrooms & Bathrooms
  if (listing.bedrooms || listing.bathrooms) {
    const parts = [];
    if (listing.bedrooms) parts.push(`${listing.bedrooms} BHK`);
    if (listing.bathrooms) parts.push(`${listing.bathrooms} Bath`);
    
    html += `
      <div style="display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>${parts.join(' • ')}</span>
      </div>
    `;
  }
  
  // Contact phone
  if (listing.contact_phone) {
    html += `
      <div style="display: flex; align-items: center; gap: 6px; color: #22c55e; font-weight: 500;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        <a href="tel:${escapeHtml(listing.contact_phone)}" style="color: inherit; text-decoration: none;">
          ${escapeHtml(listing.contact_phone)}
        </a>
      </div>
    `;
  }
  
  html += `</div>`;
  
  // Description snippet
  if (listing.description) {
    const shortDesc = listing.description.length > 100
      ? listing.description.substring(0, 100) + '...'
      : listing.description;
    html += `
      <p style="font-size: 12px; color: #94a3b8; margin: 10px 0 0 0; line-height: 1.4; border-top: 1px solid #e2e8f0; padding-top: 8px;">
        ${escapeHtml(shortDesc)}
      </p>
    `;
  }
  
  // Date footer
  const date = new Date(listing.created_at);
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  html += `
    <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #94a3b8; margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
        <line x1="16" x2="16" y1="2" y2="6"/>
        <line x1="8" x2="8" y1="2" y2="6"/>
        <line x1="3" x2="21" y1="10" y2="10"/>
      </svg>
      <span>Posted ${formattedDate}</span>
    </div>
  </div>
  `;
  
  return html;
};

interface PropertyMapProps {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
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

// Marker cluster layer component
function MarkerClusterLayer({ 
  listings, 
  onSelectListing 
}: { 
  listings: PropertyListingWithImages[]; 
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
}) {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

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

    clusterGroupRef.current = clusterGroup;

    // Add markers to cluster group
    const validListings = listings.filter(l => l.latitude && l.longitude);
    
    validListings.forEach((listing) => {
      const marker = L.marker(
        [listing.latitude!, listing.longitude!],
        { icon: createMarkerIcon(listing.property_type) }
      );
      
      marker.bindPopup(createPopupContent(listing), {
        maxWidth: 320,
        className: 'property-popup',
      });
      
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

export function PropertyMap({ listings, selectedListing, onSelectListing }: PropertyMapProps) {
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
        <MapController selectedListing={selectedListing} />
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
