import { useState, useRef, useEffect } from 'react';
import { searchNominatim, type NominatimResult } from '@/lib/geocode';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pin, Trash2, PinOff, MapPin, Loader2, Search, X, Building2, Route, Home } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  SETTLEMENT_CATEGORIES,
  AMENITY_CATEGORY_ORDER,
  formatDistance,
} from '@/lib/poi-categories';

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

/** Only amenity categories are curated by dealers — settlement categories are auto-computed. */
const AMENITY_CATEGORY_KEYS = AMENITY_CATEGORY_ORDER as readonly string[];

interface PoiRowProps {
  poi: PoiResponse;
  showApprove?: boolean;
  onApprove?: (id: string) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  isPinPending: boolean;
  isDeletePending: boolean;
  isApprovePending?: boolean;
}

function PoiRow({
  poi,
  showApprove,
  onApprove,
  onPin,
  onDelete,
  isPinPending,
  isDeletePending,
  isApprovePending,
}: PoiRowProps) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{poi.name}</p>
        <p className="text-xs text-muted-foreground">
          {CATEGORY_LABELS[poi.category] ?? poi.category} &middot;{' '}
          {formatDistance(poi.distanceMeters)}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {showApprove && onApprove && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onApprove(poi.id)}
            disabled={isApprovePending}
            aria-label={`Approve ${poi.name}`}
          >
            Approve
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onPin(poi.id)}
          disabled={isPinPending}
          aria-label={poi.pinned ? `Unpin ${poi.name}` : `Pin ${poi.name}`}
        >
          {poi.pinned ? (
            <Pin className="h-4 w-4 fill-current text-primary" />
          ) : (
            <PinOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(poi.id)}
          disabled={isDeletePending}
          aria-label={`Delete ${poi.name}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3 py-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  );
}

interface AddManualFormProps {
  listingId: string;
  onAdded: () => void;
}

function AddManualForm({ listingId, onAdded }: AddManualFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<NominatimResult[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationChip, setLocationChip] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (locationWrapperRef.current && !locationWrapperRef.current.contains(e.target as Node)) {
        setShowLocationResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLocationSearch = (value: string) => {
    setLocationQuery(value);
    setLocationChip(null);
    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
    if (!value.trim()) {
      setLocationResults([]);
      setShowLocationResults(false);
      return;
    }
    locationDebounceRef.current = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const res = await searchNominatim(value);
        setLocationResults(res);
        setShowLocationResults(res.length > 0);
      } catch {
        setLocationResults([]);
      } finally {
        setLocationSearching(false);
      }
    }, 400);
  };

  const handleLocationSelect = (result: NominatimResult) => {
    setLocationChip({ name: result.display_name, lat: result.lat, lon: result.lon });
    setLocationQuery(result.display_name);
    setShowLocationResults(false);
  };

  const handleLocationClear = () => {
    setLocationChip(null);
    setLocationQuery('');
    setLocationResults([]);
  };

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/listings/${listingId}/pois/manual`, {
        name: name.trim(),
        category,
        latitude: locationChip?.lat,
        longitude: locationChip?.lon,
      }),
    onSettled: () => {
      // Invalidates the dealer suggestions cache. The public POI cache
      // (['pois', listingId]) is managed separately by PR-15.6 public display.
      queryClient.invalidateQueries({ queryKey: ['pois', 'suggestions', listingId] });
    },
    onSuccess: () => {
      setName('');
      setCategory('');
      setLocationQuery('');
      setLocationChip(null);
      setLocationResults([]);
      onAdded();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !category) return;
    addMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label htmlFor="poi-name">Name</Label>
        <Input
          id="poi-name"
          placeholder="e.g. Sri Krishna Temple"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="poi-category">Category</Label>
        <Select value={category} onValueChange={setCategory} required>
          <SelectTrigger id="poi-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {AMENITY_CATEGORY_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {CATEGORY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="poi-location">Location (optional)</Label>
        <div ref={locationWrapperRef}>
          <div className="relative">
            {locationChip ? (
              /* Location chip */
              <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{locationChip.name}</span>
                <button
                  type="button"
                  onClick={handleLocationClear}
                  aria-label="Clear location"
                  className="shrink-0 rounded-sm hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              /* Search input */
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                {locationSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Input
                  id="poi-location"
                  placeholder="Search for a location…"
                  value={locationQuery}
                  onChange={(e) => handleLocationSearch(e.target.value)}
                  onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
                  className="pl-9 pr-9"
                />
              </div>
            )}
            {/* Dropdown results */}
            {showLocationResults && locationResults.length > 0 && (
              <ul className="absolute z-[1100] mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {locationResults.map((r, i) => (
                  <li
                    key={`${r.lat}-${r.lon}-${i}`}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-accent truncate"
                    onClick={() => handleLocationSelect(r)}
                  >
                    <MapPin className="inline-block h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    {r.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(locationQuery.length > 0 || locationChip !== null) && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={handleLocationClear}
            >
              Add without location
            </button>
          )}
        </div>
      </div>

      {addMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>Failed to add POI. Please try again.</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={addMutation.isPending || !name.trim() || !category || locationSearching}
        className="w-full"
      >
        {addMutation.isPending ? 'Adding…' : 'Add POI'}
      </Button>
    </form>
  );
}

const CARD_DESCRIPTIONS: Record<string, string> = {
  land: 'Location facts below are auto-computed from map data. Approve nearby places that buyers will find useful.',
  commercial: 'Location context is auto-computed. Approve transport and amenities relevant for tenants.',
  apartment: 'Approve the nearby amenities that are most relevant for buyers of this apartment.',
  house: 'Location context is auto-computed. Approve any nearby amenities relevant for buyers.',
};

interface PoiManagerProps {
  listingId: string;
  propertyType?: string;
}

export function PoiManager({ listingId, propertyType }: PoiManagerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('nearby');

  const {
    data: pois,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['pois', 'suggestions', listingId],
    queryFn: () => api.get<PoiResponse[]>(`/api/listings/${listingId}/pois/suggestions`),
  });

  const approveMutation = useMutation({
    mutationFn: (poiId: string) =>
      api.patch(`/api/listings/${listingId}/pois/${poiId}/approve`),
    onError: () => {
      toast({ title: 'Approval failed', description: 'Failed to approve POI. Please try again.', variant: 'destructive' });
    },
    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: ['pois', 'suggestions', listingId] });
      if (!error) setActiveTab('approved');
    },
  });

  const pinMutation = useMutation({
    mutationFn: (poiId: string) =>
      api.patch(`/api/listings/${listingId}/pois/${poiId}/pin`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pois', 'suggestions', listingId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (poiId: string) =>
      api.delete(`/api/listings/${listingId}/pois/${poiId}`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pois', 'suggestions', listingId] });
    },
  });

  // Settlement POIs are auto-computed and non-curatable — exclude from curation tabs
  const unapprovedPois = (pois ?? []).filter(
    (p) => !p.approved && !SETTLEMENT_CATEGORIES.has(p.category),
  );
  const approvedPois = (pois ?? [])
    .filter((p) => p.approved && !SETTLEMENT_CATEGORIES.has(p.category))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const da = a.distanceMeters ?? Infinity;
      const db = b.distanceMeters ?? Infinity;
      return da - db;
    });

  // Settlement POIs for the Location Context read-only block
  const settlementPois = (pois ?? []).filter((p) => SETTLEMENT_CATEGORIES.has(p.category));
  const village = settlementPois
    .filter((p) => p.category === 'VILLAGE_CENTER')
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))[0];
  const town = settlementPois
    .filter((p) => p.category === 'TOWN_CENTER')
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))[0];
  const highway = settlementPois
    .filter((p) => p.category === 'HIGHWAY')
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))[0];

  const showLocationContext =
    propertyType !== 'apartment' && (isLoading || settlementPois.length > 0);
  const cardDescription = propertyType ? CARD_DESCRIPTIONS[propertyType] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nearby Points of Interest</CardTitle>
        {cardDescription && <CardDescription>{cardDescription}</CardDescription>}
      </CardHeader>
      <CardContent>
        {/* Location Context block — auto-computed settlement data, non-interactive */}
        {showLocationContext && (
          <div className="mb-6 rounded-lg border border-border bg-muted p-4 pointer-events-none select-none">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">Location Context</span>
              <Badge variant="secondary" className="text-xs">Auto-computed</Badge>
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading location data…</span>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {village && (
                  <div className="flex items-center gap-2 min-h-[36px]">
                    <Home className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="text-muted-foreground shrink-0">Nearest village ·</span>
                    <span className="font-medium truncate">{village.name}</span>
                    <span className="text-muted-foreground shrink-0 ml-auto">
                      {formatDistance(village.distanceMeters)}
                    </span>
                  </div>
                )}
                {town && (
                  <div className="flex items-center gap-2 min-h-[36px]">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="text-muted-foreground shrink-0">Nearest town ·</span>
                    <span className="font-medium truncate">{town.name}</span>
                    <span className="text-muted-foreground shrink-0 ml-auto">
                      {formatDistance(town.distanceMeters)}
                    </span>
                  </div>
                )}
                {highway && (
                  <div className="flex items-center gap-2 min-h-[36px]">
                    <Route className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="text-muted-foreground shrink-0">Road access ·</span>
                    <span className="font-medium truncate">{highway.name}</span>
                    <span className="text-muted-foreground shrink-0 ml-auto">
                      {formatDistance(highway.distanceMeters)}
                    </span>
                  </div>
                )}
                {!village && !town && !highway && (
                  <p className="text-muted-foreground text-xs">
                    Location context not yet computed — check back shortly.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="nearby">Nearby Places</TabsTrigger>
            <TabsTrigger value="approved">
              Approved
              {approvedPois.length > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
                  {approvedPois.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Nearby Places tab */}
          <TabsContent value="nearby">
            {isLoading && <SkeletonRows />}
            {isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to load POI suggestions. Please refresh and try again.
                </AlertDescription>
              </Alert>
            )}
            {!isLoading && !isError && unapprovedPois.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No nearby places found for this listing.
              </p>
            )}
            {!isLoading && !isError && unapprovedPois.length > 0 && (
              <div>
                {unapprovedPois.map((poi) => (
                  <PoiRow
                    key={poi.id}
                    poi={poi}
                    showApprove={true}
                    onApprove={(id) => approveMutation.mutate(id)}
                    onPin={(id) => pinMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    isPinPending={pinMutation.isPending && pinMutation.variables === poi.id}
                    isDeletePending={deleteMutation.isPending && deleteMutation.variables === poi.id}
                    isApprovePending={approveMutation.isPending && approveMutation.variables === poi.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Approved tab */}
          <TabsContent value="approved">
            {isLoading && <SkeletonRows />}
            {isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to load approved POIs. Please refresh and try again.
                </AlertDescription>
              </Alert>
            )}
            {!isLoading && !isError && approvedPois.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No approved POIs yet. Approve suggestions to show them here.
              </p>
            )}
            {!isLoading && !isError && approvedPois.length > 0 && (
              <div>
                {approvedPois.map((poi) => (
                  <PoiRow
                    key={poi.id}
                    poi={poi}
                    onPin={(id) => pinMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    isPinPending={pinMutation.isPending && pinMutation.variables === poi.id}
                    isDeletePending={deleteMutation.isPending && deleteMutation.variables === poi.id}
                  />
                ))}
              </div>
            )}
            <Separator className="my-4" />
            <p className="text-sm font-medium mb-3">Add manually</p>
            <AddManualForm listingId={listingId} onAdded={() => {}} />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground mt-4">
          POI data &copy; OpenStreetMap contributors (ODbL)
        </p>
      </CardContent>
    </Card>
  );
}
