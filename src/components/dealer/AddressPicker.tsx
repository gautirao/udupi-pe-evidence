import { useState, useRef, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { searchNominatim, reverseGeocode, type NominatimResult } from '@/lib/geocode';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, MapPin, Check, Loader2 } from 'lucide-react';

// Fix default marker icons in Leaflet (same fix as PropertyMap)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const UDUPI_CENTER: L.LatLngExpression = [13.3409, 74.7421];
const DEFAULT_ZOOM = 13;
const SEARCH_DEBOUNCE_MS = 500;

export interface AddressConfirmation {
  latitude: number;
  longitude: number;
  locality: string;
  addressConfirmed: boolean;
}

export interface AddressPickerProps {
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialLocality?: string | null;
  onConfirm: (address: AddressConfirmation) => void;
}

/** Fly the map to a given position when it changes. */
function MapFlyTo({ position }: { position: L.LatLngExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 16, { duration: 0.8 });
    }
  }, [position, map]);
  return null;
}

export function AddressPicker({
  initialLatitude,
  initialLongitude,
  initialLocality,
  onConfirm,
}: AddressPickerProps) {
  // --- state ---
  const [query, setQuery] = useState(initialLocality ?? '');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const hasInitial =
    initialLatitude != null &&
    initialLongitude != null &&
    !isNaN(initialLatitude) &&
    !isNaN(initialLongitude);

  const [pinPosition, setPinPosition] = useState<L.LatLngTuple | null>(
    hasInitial ? [initialLatitude!, initialLongitude!] : null,
  );
  const [displayName, setDisplayName] = useState(initialLocality ?? '');
  const [confirmed, setConfirmed] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- search with debounce ---
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
    setConfirmed(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchNominatim(value);
        setResults(res);
        setShowResults(res.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  // --- pick a search result ---
  const handleSelectResult = useCallback((result: NominatimResult) => {
    const pos: L.LatLngTuple = [result.lat, result.lon];
    setPinPosition(pos);
    setDisplayName(result.display_name);
    setQuery(result.display_name);
    setShowResults(false);
    setConfirmed(false);
  }, []);

  // --- marker drag end ---
  const handleMarkerDragEnd = useCallback(
    async (e: L.DragEndEvent) => {
      const latlng = (e.target as L.Marker).getLatLng();
      const pos: L.LatLngTuple = [latlng.lat, latlng.lng];
      setPinPosition(pos);
      setConfirmed(false);

      try {
        const rev = await reverseGeocode(latlng.lat, latlng.lng);
        if (rev) {
          setDisplayName(rev.display_name);
          setQuery(rev.display_name);
        }
      } catch {
        // keep existing display name on reverse-geocode failure
      }
    },
    [],
  );

  // --- confirm ---
  const handleConfirm = useCallback(() => {
    if (!pinPosition) return;
    setConfirmed(true);
    onConfirm({
      latitude: pinPosition[0],
      longitude: pinPosition[1],
      locality: displayName,
      addressConfirmed: true,
    });
  }, [pinPosition, displayName, onConfirm]);

  // Marker event handlers ref for react-leaflet
  const markerEventHandlers = {
    dragend: handleMarkerDragEnd,
  };

  return (
    <div className="space-y-3">
      <Label>Location</Label>

      {/* Search input */}
      <div className="relative" ref={wrapperRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for a location (e.g. Manipal, Udupi)"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="pl-9 pr-9"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Results dropdown */}
        {showResults && results.length > 0 && (
          <ul className="absolute z-[1100] mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {results.map((r, i) => (
              <li
                key={`${r.lat}-${r.lon}-${i}`}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent truncate"
                onClick={() => handleSelectResult(r)}
              >
                <MapPin className="inline-block h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                {r.display_name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div className="h-[300px] rounded-lg overflow-hidden border">
        <MapContainer
          center={pinPosition ?? UDUPI_CENTER}
          zoom={pinPosition ? 16 : DEFAULT_ZOOM}
          className="w-full h-full z-0"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFlyTo position={pinPosition} />
          {pinPosition && (
            <Marker
              position={pinPosition}
              draggable
              eventHandlers={markerEventHandlers}
            />
          )}
        </MapContainer>
      </div>

      {/* Display name & confirm */}
      {pinPosition && (
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm text-muted-foreground truncate">
            {displayName || `${pinPosition[0].toFixed(5)}, ${pinPosition[1].toFixed(5)}`}
          </p>
          <Button
            size="sm"
            variant={confirmed ? 'outline' : 'default'}
            onClick={handleConfirm}
            disabled={confirmed}
          >
            {confirmed ? (
              <>
                <Check className="mr-1.5 h-4 w-4 text-green-600" />
                Confirmed
              </>
            ) : (
              'Confirm Location'
            )}
          </Button>
        </div>
      )}

      {!pinPosition && (
        <p className="text-sm text-muted-foreground">
          Search for a location above, then drag the pin to the exact spot.
        </p>
      )}
    </div>
  );
}
