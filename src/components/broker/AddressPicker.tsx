import { useState, useRef, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  searchNominatim,
  reverseGeocode,
  parseAddress,
  type NominatimResult,
  type ParsedAddress,
} from '@/lib/geocode';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, MapPin, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Fix default marker icons in Leaflet (same fix as PropertyMap)
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
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
const SEARCH_DEBOUNCE_MS = 400;

/** Normalized address output emitted by AddressPicker. */
export interface AddressPickerValue {
  address_line1: string;
  address_line2?: string;
  city?: string;
  county?: string;
  postcode?: string;
  country?: string;
  lat: number;
  lng: number;
  address_confirmed: boolean;
}

export interface AddressPickerProps {
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialLocality?: string | null;
  initialConfirmed?: boolean;
  onConfirm: (address: AddressPickerValue) => void;
  onUnconfirm?: () => void;
}

/** Fly the map to a given position when it changes. */
function MapFlyTo({ position }: { position: L.LatLngExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      try {
        // invalidateSize() first: the wizard uses CSS display:none/block toggling,
        // so this MapContainer may have been initialised while hidden (0×0 size).
        // Leaflet's flyTo animation interpolates from the current centre, which can
        // be NaN when the map never measured its container.  Invalidating here
        // re-reads the container dimensions before the animation begins.
        map.invalidateSize();

        // Guard: if the container is still hidden (0×0), the map centre remains
        // NaN even after invalidateSize(). Attempting flyTo from NaN throws
        // "Invalid LatLng object". Bail out and let the next render retry.
        const size = map.getSize();
        if (!size || size.x === 0 || size.y === 0) return;

        map.flyTo(position, 16, { duration: 0.8 });
      } catch {
        // Leaflet throws "Invalid LatLng object" when the map container is
        // hidden (display:none) and has no measurable dimensions. This is
        // harmless — the flyTo will succeed when the step panel becomes visible
        // and triggers a re-render.
      }
    }
  }, [position, map]);
  return null;
}

/** Forward map click events to a callback. */
function MapClickHandler({ onClick }: { onClick: (latlng: L.LatLng) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

function buildOutput(
  lat: number,
  lng: number,
  parsed: ParsedAddress,
  confirmed: boolean,
): AddressPickerValue {
  return {
    address_line1: parsed.address_line1,
    address_line2: parsed.address_line2,
    city: parsed.city,
    county: parsed.county,
    postcode: parsed.postcode,
    country: parsed.country,
    lat,
    lng,
    address_confirmed: confirmed,
  };
}

export function AddressPicker({
  initialLatitude,
  initialLongitude,
  initialLocality,
  initialConfirmed,
  onConfirm,
  onUnconfirm,
}: AddressPickerProps) {
  // --- state ---
  const [query, setQuery] = useState(initialLocality ?? '');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);

  const hasInitial =
    initialLatitude != null &&
    initialLongitude != null &&
    !isNaN(initialLatitude) &&
    !isNaN(initialLongitude);

  const [pinPosition, setPinPosition] = useState<L.LatLngTuple | null>(
    hasInitial ? [initialLatitude!, initialLongitude!] : null,
  );
  const [displayName, setDisplayName] = useState(initialLocality ?? '');
  const [confirmed, setConfirmed] = useState(initialConfirmed ?? false);
  const [dragged, setDragged] = useState(false);

  // Parsed address fields for display and confirm output
  const [parsedAddress, setParsedAddress] = useState<ParsedAddress>({ address_line1: '' });

  const [geolocating, setGeolocating] = useState(false);

  const { toast } = useToast();

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
    // Typing alone never confirms
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setShowResults(false);
      setNoResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setNoResults(false);
      try {
        const res = await searchNominatim(value);
        setResults(res);
        setShowResults(true); // show dropdown even for zero results
        setNoResults(res.length === 0);
      } catch {
        setResults([]);
        setNoResults(false);
        setShowResults(false);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  // --- pick a search result → auto-confirm ---
  const handleSelectResult = useCallback(
    (result: NominatimResult) => {
      const pos: L.LatLngTuple = [result.lat, result.lon];
      const parsed = parseAddress(result.address);
      setParsedAddress(parsed);

      setPinPosition(pos);
      setDisplayName(result.display_name);
      setQuery(result.display_name);
      setShowResults(false);
      setDragged(false);
      setConfirmed(true);

      onConfirm(buildOutput(result.lat, result.lon, parsed, true));
    },
    [onConfirm],
  );

  // --- marker drag end → unconfirm, require explicit confirm ---
  const handleMarkerDragEnd = useCallback(async (e: L.DragEndEvent) => {
    const latlng = (e.target as L.Marker).getLatLng();
    const pos: L.LatLngTuple = [latlng.lat, latlng.lng];
    setPinPosition(pos);
    setConfirmed(false);
    setDragged(true);
    setReverseGeocoding(true);

    try {
      const rev = await reverseGeocode(latlng.lat, latlng.lng);
      if (rev) {
        const parsed = parseAddress(rev.address);
        setParsedAddress(parsed);
        setDisplayName(rev.display_name);
        setQuery(rev.display_name);
      }
    } catch {
      // keep existing display name on failure
    } finally {
      setReverseGeocoding(false);
    }
  }, []);

  // --- map click → place/move pin, require explicit confirm ---
  const handleMapClick = useCallback(async (latlng: L.LatLng) => {
    const pos: L.LatLngTuple = [latlng.lat, latlng.lng];
    setPinPosition(pos);
    setConfirmed(false);
    setDragged(true);
    setReverseGeocoding(true);

    try {
      const rev = await reverseGeocode(latlng.lat, latlng.lng);
      if (rev) {
        const parsed = parseAddress(rev.address);
        setParsedAddress(parsed);
        setDisplayName(rev.display_name);
        setQuery(rev.display_name);
      }
    } catch {
      // keep existing display name on failure
    } finally {
      setReverseGeocoding(false);
    }
  }, []);

  // --- geolocation: use browser location to place pin ---
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: 'Not supported', description: 'Geolocation is not supported by your browser.' });
      return;
    }
    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const pos: L.LatLngTuple = [latitude, longitude];
        setPinPosition(pos);
        setConfirmed(false);
        setDragged(true);
        setReverseGeocoding(true);
        try {
          const rev = await reverseGeocode(latitude, longitude);
          if (rev) {
            const parsed = parseAddress(rev.address);
            setParsedAddress(parsed);
            setDisplayName(rev.display_name);
            setQuery(rev.display_name);
          }
        } catch {
          // keep existing display name
        } finally {
          setGeolocating(false);
          setReverseGeocoding(false);
        }
      },
      (error) => {
        setGeolocating(false);
        const messages: Record<number, string> = {
          1: 'Location access denied. Please allow location access in your browser settings.',
          2: 'Location unavailable. Please try searching manually.',
          3: 'Location request timed out. Please try again.',
        };
        toast({
          title: 'Could not get location',
          description: messages[error.code] ?? 'An unknown error occurred.',
          variant: 'destructive',
        });
      },
      { timeout: 10000 },
    );
  }, [toast]);

  // --- explicit confirm after drag ---
  const handleConfirmClick = useCallback(() => {
    if (!pinPosition) return;
    setConfirmed(true);
    setDragged(false);
    onConfirm(buildOutput(pinPosition[0], pinPosition[1], parsedAddress, true));
  }, [pinPosition, onConfirm, parsedAddress]);

  // --- change location: reset confirmed state, preserve pin position ---
  const handleChangeLocation = useCallback(() => {
    setConfirmed(false);
    setDragged(false);
    setQuery('');
    setDisplayName('');
    setParsedAddress({ address_line1: '' });
    onUnconfirm?.();
  }, [onUnconfirm]);

  const markerEventHandlers = { dragend: handleMarkerDragEnd };

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

        {/* Results dropdown — py-3 for mobile touch targets */}
        {showResults && (
          <ul className="absolute z-[1100] mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
            {results.length > 0 ? results.map((r, i) => (
              <li
                key={`${r.lat}-${r.lon}-${i}`}
                className="px-3 py-3 text-sm cursor-pointer hover:bg-accent active:bg-accent truncate"
                onClick={() => handleSelectResult(r)}
              >
                <MapPin className="inline-block h-3.5 w-3.5 mr-1.5 flex-shrink-0 text-muted-foreground" />
                {r.display_name}
              </li>
            )) : noResults ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                No locations found for "{query}". Try a different search.
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {/* Use my location button */}
      {!!navigator.geolocation && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleUseMyLocation}
            disabled={geolocating}
          >
            {geolocating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Getting location…
              </>
            ) : (
              <>
                <MapPin className="h-3 w-3 mr-1" />
                Use my location
              </>
            )}
          </Button>
        </div>
      )}

      {/* Map */}
      <div className="h-[300px] sm:h-[360px] rounded-lg overflow-hidden border">
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
          <MapClickHandler onClick={handleMapClick} />
          {pinPosition && (
            <Marker
              position={pinPosition}
              draggable
              eventHandlers={markerEventHandlers}
            />
          )}
        </MapContainer>
      </div>

      {/* Status bar: display name + confirm/confirmed state */}
      {pinPosition && (
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm text-muted-foreground line-clamp-2 flex items-center gap-1.5">
            {reverseGeocoding && (
              <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
            )}
            {reverseGeocoding
              ? 'Looking up address…'
              : displayName || `${pinPosition[0].toFixed(5)}, ${pinPosition[1].toFixed(5)}`}
          </p>

          {dragged && !confirmed ? (
            <Button size="sm" onClick={handleConfirmClick}>
              Confirm Location
            </Button>
          ) : confirmed ? (
            <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span>Location confirmed</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                onClick={handleChangeLocation}
              >
                Change
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {confirmed && (parsedAddress.address_line1 || parsedAddress.city || parsedAddress.postcode) && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-0.5">
          {parsedAddress.address_line1 && (
            <p className="font-medium">{parsedAddress.address_line1}</p>
          )}
          {(parsedAddress.city || parsedAddress.postcode) && (
            <p className="text-muted-foreground">
              {[parsedAddress.city, parsedAddress.postcode].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      )}

      {!pinPosition && (
        <p className="text-sm text-muted-foreground">
          Search for a location above, click the map to place a pin, or use "Use my location".
        </p>
      )}
    </div>
  );
}
