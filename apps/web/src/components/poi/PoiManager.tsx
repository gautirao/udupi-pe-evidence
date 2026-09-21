import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
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
import {
  Pin,
  Trash2,
  PinOff,
  MapPin,
  Loader2,
  Search,
  Building2,
  Route,
  Home,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  CATEGORY_LABELS,
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
  /** True for a broker-added manual POI (source === "manual") — never platform-verified. */
  brokerAdded: boolean;
}

interface SuggestionsResponse {
  pois: PoiResponse[];
  /** True when the last Overpass fetch attempt for this listing failed (not a genuine empty result). */
  providerIssue: boolean;
}

/** Only amenity categories are curated by dealers — settlement categories are auto-computed. */
const AMENITY_CATEGORY_KEYS = AMENITY_CATEGORY_ORDER as readonly string[];

interface PoiRowProps {
  poi: PoiResponse;
  showApprove?: boolean;
  onApprove?: (id: string) => void;
  /** Suggested-mode rows don't offer pin/unpin — that's an Approved-list action (design §7). */
  showPin?: boolean;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  isPinPending: boolean;
  isDeletePending: boolean;
  isApprovePending?: boolean;
  /** "Dismiss" for a not-yet-approved suggestion, "Delete" for an approved entry — same DELETE call either way. */
  deleteVerb?: 'Delete' | 'Dismiss';
}

function PoiRow({
  poi,
  showApprove,
  onApprove,
  showPin = true,
  onPin,
  onDelete,
  isPinPending,
  isDeletePending,
  isApprovePending,
  deleteVerb = 'Delete',
}: PoiRowProps) {
  // Design §11.3 — a manual POI with no distance must render category-only,
  // never a placeholder ("manual", "0 km", etc.). formatDistance(null) itself
  // returns "manual" for other call-sites (Location Context) that always have
  // a real distance, so the omission is handled here rather than there.
  const detailLine =
    poi.distanceMeters == null
      ? (CATEGORY_LABELS[poi.category] ?? poi.category)
      : `${CATEGORY_LABELS[poi.category] ?? poi.category} · ${formatDistance(poi.distanceMeters)}`;

  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{poi.name}</p>
          {poi.brokerAdded && (
            <Badge variant="secondary" className="shrink-0 text-[10px] tracking-wide">
              BROKER-ADDED
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{detailLine}</p>
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
        {showPin && (
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
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(poi.id)}
          disabled={isDeletePending}
          aria-label={`${deleteVerb} ${poi.name}`}
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

export type DistanceUnit = 'km' | 'm';

/**
 * Only `1.3`, `.5`, `850`, etc. — no negative sign, no exponents, no free
 * text. Exported for direct unit testing (jsdom's Radix Select interaction
 * makes DOM-level exercise of this unreliable — see PoiManager.test.tsx).
 */
export const DISTANCE_PATTERN = /^\d*\.?\d+$/;

/**
 * Scoped per listing (not a bare global key) so a broker editing multiple
 * listings in one browser session doesn't have one listing's last-used unit
 * leak into another's default (issue #2642 risk).
 */
export function distanceUnitStorageKey(listingId: string): string {
  return `poi-manual-distance-unit:${listingId}`;
}

export function getStoredDistanceUnit(listingId: string): DistanceUnit {
  try {
    const stored = window.localStorage.getItem(distanceUnitStorageKey(listingId));
    return stored === 'm' ? 'm' : 'km';
  } catch {
    // localStorage can throw (private browsing, disabled storage) — fall back silently.
    return 'km';
  }
}

export function storeDistanceUnit(listingId: string, unit: DistanceUnit): void {
  try {
    window.localStorage.setItem(distanceUnitStorageKey(listingId), unit);
  } catch {
    // Non-critical convenience — ignore write failures.
  }
}

/** `1.3 km -> 1300`, `850 m -> 850`. Caller must have already validated `trimmed`. */
export function normalizeDistanceMeters(trimmed: string, unit: DistanceUnit): number {
  const value = parseFloat(trimmed);
  return unit === 'km' ? Math.round(value * 1000) : Math.round(value);
}

/** `''` is valid (blank/omitted); otherwise must match {@link DISTANCE_PATTERN} and be `> 0`. */
export function isDistanceInputValid(trimmed: string): boolean {
  return trimmed === '' || (DISTANCE_PATTERN.test(trimmed) && parseFloat(trimmed) > 0);
}

interface AddManualFormProps {
  listingId: string;
  onAdded: () => void;
}

function AddManualForm({ listingId, onAdded }: AddManualFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [distanceText, setDistanceText] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(() => getStoredDistanceUnit(listingId));

  const trimmedDistance = distanceText.trim();
  const distanceValid = isDistanceInputValid(trimmedDistance);

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/listings/${listingId}/pois/manual`, {
        name: name.trim(),
        category,
        distanceMeters: trimmedDistance === '' ? null : normalizeDistanceMeters(trimmedDistance, distanceUnit),
      }),
    onSettled: () => {
      // Invalidates the dealer suggestions cache. The public POI cache
      // (['pois', listingId]) is managed separately by PR-15.6 public display.
      queryClient.invalidateQueries({ queryKey: ['pois', 'suggestions', listingId] });
    },
    onSuccess: () => {
      storeDistanceUnit(listingId, distanceUnit);
      setName('');
      setCategory('');
      setDistanceText('');
      onAdded();
    },
  });

  const canSubmit = name.trim() !== '' && category !== '' && distanceValid && !addMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
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
        <Label htmlFor="poi-distance">
          Distance from property <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="poi-distance"
            inputMode="decimal"
            placeholder="e.g. 1.3"
            value={distanceText}
            onChange={(e) => setDistanceText(e.target.value)}
            aria-invalid={!distanceValid}
            aria-describedby="poi-distance-hint"
            className={!distanceValid ? 'border-amber-500 focus-visible:ring-amber-500' : undefined}
          />
          <Select value={distanceUnit} onValueChange={(v) => setDistanceUnit(v as DistanceUnit)}>
            <SelectTrigger className="w-20" aria-label="Distance unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="km">km</SelectItem>
              <SelectItem value="m">m</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {distanceValid ? (
          <p id="poi-distance-hint" className="text-xs text-muted-foreground">
            Add the approximate distance if you know it — you can leave this blank.
          </p>
        ) : (
          <p id="poi-distance-hint" className="text-xs text-amber-600">
            Enter a positive number, like 1.3 or 850.
          </p>
        )}
      </div>

      {addMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>Failed to add POI. Please try again.</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {addMutation.isPending ? 'Adding…' : 'Add place'}
      </Button>

      <p className="text-xs text-muted-foreground">
        Places you add are labelled broker-added, not platform-verified.
      </p>
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
  const [activeTab, setActiveTab] = useState('suggested');

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['pois', 'suggestions', listingId],
    queryFn: () => api.get<SuggestionsResponse>(`/api/listings/${listingId}/pois/suggestions`),
  });

  const pois = data?.pois;
  const providerIssue = data?.providerIssue ?? false;

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
  const suggestedPois = (pois ?? []).filter(
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
            <TabsTrigger value="suggested">Suggested nearby places</TabsTrigger>
            <TabsTrigger value="approved">
              Approved
              {approvedPois.length > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
                  {approvedPois.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="manual">Add manually</TabsTrigger>
          </TabsList>

          {/* Suggested tab — provider-derived, unapproved, non-settlement POIs. Approve/Dismiss only. */}
          <TabsContent value="suggested">
            {isLoading && <SkeletonRows />}
            {isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  <p>Failed to load POI suggestions. Please refresh and try again.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()} disabled={isRefetching}>
                    {isRefetching ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Retrying…
                      </>
                    ) : (
                      'Retry'
                    )}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {/* Provider failure — recoverable, NOT a confirmed empty result. Ochre, not destructive red. */}
            {!isLoading && !isError && suggestedPois.length === 0 && providerIssue && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle>Couldn&apos;t fetch nearby places right now</AlertTitle>
                <AlertDescription>
                  <p>
                    The map data provider may be temporarily unavailable. Your pin and the rest of
                    this listing are unaffected.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                      {isRefetching ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Retrying…
                        </>
                      ) : (
                        'Retry'
                      )}
                    </Button>
                    <button
                      type="button"
                      className="text-sm underline-offset-2 hover:underline"
                      onClick={() => setActiveTab('manual')}
                    >
                      You can still add a place manually.
                    </button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {/* All suggestions reviewed — distinct from a genuinely empty result (design §7). */}
            {!isLoading && !isError && suggestedPois.length === 0 && !providerIssue && approvedPois.length > 0 && (
              <div className="rounded-lg border border-dashed py-8 text-center">
                <p className="text-sm font-medium">All suggestions reviewed</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;ve approved or dismissed every suggested place for this listing.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => refetch()}
                  disabled={isRefetching}
                >
                  {isRefetching ? 'Checking…' : 'Check again'}
                </Button>
              </div>
            )}
            {/* Genuine empty — an invitation to add, not a failure. */}
            {!isLoading && !isError && suggestedPois.length === 0 && !providerIssue && approvedPois.length === 0 && (
              <div className="rounded-lg border border-dashed py-8 text-center">
                <Search className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">
                  No nearby places were found around this location.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Common for new layouts and outskirt plots. Add the landmarks buyers ask about — a
                  school, bus stop or temple.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-3">
                  <Button size="sm" onClick={() => setActiveTab('manual')}>
                    Add a place manually
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                    {isRefetching ? 'Checking…' : 'Check again'}
                  </Button>
                </div>
              </div>
            )}
            {!isLoading && !isError && suggestedPois.length > 0 && (
              <div>
                {suggestedPois.map((poi) => (
                  <PoiRow
                    key={poi.id}
                    poi={poi}
                    showApprove={true}
                    showPin={false}
                    deleteVerb="Dismiss"
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

          {/* Approved tab — approved, non-settlement POIs. No manual form nested here (design §7). */}
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
              <div className="py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No approved places yet. Approve a suggestion or add one manually.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-3">
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('suggested')}>
                    View suggestions
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveTab('manual')}>
                    Add manually
                  </Button>
                </div>
              </div>
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
          </TabsContent>

          {/* Add manually tab — its own mode, not nested under Approved (design §7/§8). */}
          <TabsContent value="manual">
            <AddManualForm listingId={listingId} onAdded={() => setActiveTab('approved')} />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground mt-4">
          POI data &copy; OpenStreetMap contributors (ODbL)
        </p>
      </CardContent>
    </Card>
  );
}
