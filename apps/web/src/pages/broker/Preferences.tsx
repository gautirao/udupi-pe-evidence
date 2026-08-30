import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AlertCircle, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useBrokerMarketFocus,
  useAddMarketFocus,
  useRemoveMarketFocus,
  useSeedMarketFocus,
} from '@/hooks/useBrokerMarketFocus';
import type { MarketFocusItem, MarketFocusTuple, AddMarketFocusInput } from '@/hooks/useBrokerMarketFocus';

// ─── Static options ───────────────────────────────────────────────────────────
// These mirror the seeded area set used by the backend. If the backend widens
// the set, update here. The server resolves citySlug from areaKey — never derive
// it on the client.

interface AreaOption {
  areaKey: string;
  label: string;
}

const AREA_OPTIONS: AreaOption[] = [
  { areaKey: 'IN|KA|Udupi|Manipal',       label: 'Manipal, Udupi' },
  { areaKey: 'IN|KA|Udupi|Kunjibettu',    label: 'Kunjibettu, Udupi' },
  { areaKey: 'IN|KA|Udupi|Amoghapura',    label: 'Amoghapura, Udupi' },
  { areaKey: 'IN|KA|Mangalore|Kadri',     label: 'Kadri, Mangalore' },
  { areaKey: 'IN|KA|Mangalore|Attavar',   label: 'Attavar, Mangalore' },
  { areaKey: 'IN|KA|Mangalore|Balmatta',  label: 'Balmatta, Mangalore' },
  { areaKey: 'IN|KA|Bengaluru|Whitefield',   label: 'Whitefield, Bangalore' },
  { areaKey: 'IN|KA|Bengaluru|Koramangala',  label: 'Koramangala, Bangalore' },
  { areaKey: 'IN|KA|Bengaluru|Indiranagar',  label: 'Indiranagar, Bangalore' },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: 'house',               label: 'House' },
  { value: 'apartment',          label: 'Apartment' },
  { value: 'land',               label: 'Land' },
  { value: 'commercial',         label: 'Commercial' },
  { value: 'commercial_building', label: 'Commercial Building' },
  { value: 'warehouse',          label: 'Warehouse' },
  { value: 'commercial_land',    label: 'Commercial Land' },
  { value: 'agricultural_land',  label: 'Agricultural Land' },
  { value: 'other',              label: 'Other' },
];

const LISTING_PURPOSE_OPTIONS = [
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function areaLabel(areaKey: string): string {
  return AREA_OPTIONS.find((a) => a.areaKey === areaKey)?.label ?? areaKey.split('|').pop() ?? areaKey;
}

function propertyTypeLabel(value: string): string {
  return PROPERTY_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function listingPurposeLabel(value: string): string {
  return LISTING_PURPOSE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function tupleKey(item: MarketFocusTuple): string {
  return `${item.citySlug}|${item.areaKey}|${item.propertyType}|${item.listingPurpose}`;
}

/**
 * Key for duplicate detection in the add form.
 * Does NOT include citySlug because it is unknown before the server resolves it.
 * We match on the 3 user-supplied fields; a same-area key with a different
 * server-resolved city (cross-boundary) would still be a logical duplicate.
 */
function addKey(input: AddMarketFocusInput): string {
  return `${input.areaKey}|${input.propertyType}|${input.listingPurpose}`;
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'seeded' | 'manual' }) {
  return source === 'seeded' ? (
    <Badge className="bg-blue-100 text-blue-800 border-0 text-xs">seeded</Badge>
  ) : (
    <Badge className="bg-[hsl(var(--copper))]/10 text-[hsl(var(--copper))] border-0 text-xs">manual</Badge>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading market focus preferences">
      <div className="flex justify-between items-center mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Add focus form ───────────────────────────────────────────────────────────

interface AddFocusFormProps {
  existingAddKeys: Set<string>;
  onAdd: (input: AddMarketFocusInput) => void;
  isPending: boolean;
}

function AddFocusForm({ existingAddKeys, onAdd, isPending }: AddFocusFormProps) {
  const [areaKey, setAreaKey] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [listingPurpose, setListingPurpose] = useState('');

  const isComplete = areaKey !== '' && propertyType !== '' && listingPurpose !== '';

  const isDuplicate =
    isComplete &&
    existingAddKeys.has(addKey({ areaKey, propertyType, listingPurpose }));

  function handleAdd() {
    if (!isComplete) return;
    onAdd({ areaKey, propertyType, listingPurpose });
    setAreaKey('');
    setPropertyType('');
    setListingPurpose('');
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Add Focus Area</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select value={areaKey} onValueChange={setAreaKey}>
            <SelectTrigger aria-label="Select area">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              {AREA_OPTIONS.map((o) => (
                <SelectItem key={o.areaKey} value={o.areaKey}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={propertyType} onValueChange={setPropertyType}>
            <SelectTrigger aria-label="Select property type">
              <SelectValue placeholder="Property type" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={listingPurpose} onValueChange={setListingPurpose}>
            <SelectTrigger aria-label="Select listing purpose">
              <SelectValue placeholder="Purpose" />
            </SelectTrigger>
            <SelectContent>
              {LISTING_PURPOSE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isDuplicate && (
          <p className="mt-2 text-xs text-amber-600" role="alert">
            This combination already exists in your focus list.
          </p>
        )}

        <Button
          className="mt-4"
          onClick={handleAdd}
          disabled={!isComplete || isPending || isDuplicate}
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden />
          {isPending ? 'Adding…' : 'Add'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Focus item row ───────────────────────────────────────────────────────────

interface FocusRowProps {
  item: MarketFocusItem;
  onRemove: (tuple: MarketFocusTuple) => void;
  isRemoving: boolean;
}

function FocusRow({ item, onRemove, isRemoving }: FocusRowProps) {
  const tuple: MarketFocusTuple = {
    citySlug: item.citySlug,
    areaKey: item.areaKey,
    propertyType: item.propertyType,
    listingPurpose: item.listingPurpose,
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        <span className="text-sm font-medium text-foreground truncate">
          {areaLabel(item.areaKey)}
        </span>
        <span className="text-xs text-muted-foreground">&middot;</span>
        <span className="text-sm text-muted-foreground">{propertyTypeLabel(item.propertyType)}</span>
        <span className="text-xs text-muted-foreground">&middot;</span>
        <span className="text-sm text-muted-foreground">{listingPurposeLabel(item.listingPurpose)}</span>
        <SourceBadge source={item.source} />
      </div>

      {item.source === 'manual' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="ml-3 shrink-0 text-destructive hover:text-destructive"
              aria-label={`Remove focus area: ${areaLabel(item.areaKey)}`}
              disabled={isRemoving}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove focus area?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove <strong>{areaLabel(item.areaKey)}</strong> /{' '}
                {propertyTypeLabel(item.propertyType)} / {listingPurposeLabel(item.listingPurpose)}{' '}
                from your market focus. You can add it back at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRemove(tuple)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrokerPreferences() {
  const { isBroker, isAdmin, isLoading: authLoading } = useAuth();
  const { data, isLoading, isError, error, refetch } = useBrokerMarketFocus();
  const addMutation = useAddMarketFocus();
  const removeMutation = useRemoveMarketFocus();
  const seedMutation = useSeedMarketFocus();

  // All hooks must be called unconditionally before any early return.

  // Broker-guard: redirect non-broker, non-admin users (after all hooks).
  if (!authLoading && !isBroker && !isAdmin) {
    return <Navigate to="/broker/setup" replace />;
  }

  const items = data ?? [];

  // Full tuple key set — used for react list keys in the rendered rows
  const existingKeys = new Set(items.map((item) => tupleKey(item)));
  // 3-field add key set — used for duplicate detection in the add form (citySlug unknown at add time)
  const existingAddKeys = new Set(items.map((item) => addKey({ areaKey: item.areaKey, propertyType: item.propertyType, listingPurpose: item.listingPurpose })));

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-5 w-5 text-[hsl(var(--copper))]" aria-hidden />
            <h1 className="text-2xl font-bold text-foreground">Market Focus</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Define the city-area, property-type, and purpose buckets you specialise in. These preferences
            personalise your dashboard and future market-intelligence features.
          </p>
        </div>

        {/* Loading state */}
        {isLoading && <LoadingSkeleton />}

        {/* Error state */}
        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                {error?.status === 403
                  ? 'Access denied. Broker or admin role required.'
                  : 'Failed to load market focus preferences. Please try again.'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="ml-3 shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Success state — render even when data is an empty array */}
        {!isLoading && !isError && data !== undefined && (
          <>
            {/* Re-seed action */}
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                aria-label="Re-seed focus areas from live listings"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1 ${seedMutation.isPending ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                {seedMutation.isPending ? 'Seeding…' : 'Seed from my listings'}
              </Button>
            </div>

            {/* Add form */}
            <AddFocusForm
              existingAddKeys={existingAddKeys}
              onAdd={(input) => addMutation.mutate(input)}
              isPending={addMutation.isPending}
            />

            {/* Empty state — AC5 */}
            {items.length === 0 ? (
              <EmptyState
                icon={<MapPin className="h-8 w-8 text-muted-foreground" aria-hidden />}
                heading="No market focus areas yet"
                description="Seed from your live listings to get started, or add focus areas manually above."
                primaryAction={{
                  label: 'Seed from my listings',
                  onClick: () => seedMutation.mutate(),
                }}
                secondaryAction={{
                  label: 'Add a listing',
                  href: '/broker/listings/new',
                }}
              />
            ) : (
              /* Focus list */
              <div
                className="space-y-2"
                aria-live="polite"
                aria-label="Market focus areas"
              >
                {items.map((item) => (
                  <FocusRow
                    key={tupleKey(item)}
                    item={item}
                    onRemove={(tuple) => removeMutation.mutate(tuple)}
                    isRemoving={removeMutation.isPending}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
