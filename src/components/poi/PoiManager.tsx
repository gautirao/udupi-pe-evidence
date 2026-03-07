import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Pin, Trash2, PinOff } from 'lucide-react';

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

const CATEGORY_LABELS: Record<string, string> = {
  WORSHIP: 'Place of Worship',
  HOSPITAL: 'Hospital / Clinic',
  SCHOOL: 'School / University',
  HOTEL: 'Hotel',
  TRANSPORT: 'Bus / Transit',
  AIRPORT: 'Airport',
  GROCERY: 'Supermarket / Market',
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters == null) return 'manual';
  if (distanceMeters < 1000) return `${distanceMeters} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

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
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/listings/${listingId}/pois/manual`, {
        name: name.trim(),
        category,
        latitude: latitude !== '' ? parseFloat(latitude) : undefined,
        longitude: longitude !== '' ? parseFloat(longitude) : undefined,
      }),
    onSettled: () => {
      // Invalidates the dealer suggestions cache. The public POI cache
      // (['pois', listingId]) is managed separately by PR-15.6 public display.
      queryClient.invalidateQueries({ queryKey: ['pois', 'suggestions', listingId] });
    },
    onSuccess: () => {
      setName('');
      setCategory('');
      setLatitude('');
      setLongitude('');
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
            {CATEGORY_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {CATEGORY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="poi-lat">Latitude (optional)</Label>
          <Input
            id="poi-lat"
            type="number"
            step="any"
            placeholder="e.g. 13.3409"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="poi-lon">Longitude (optional)</Label>
          <Input
            id="poi-lon"
            type="number"
            step="any"
            placeholder="e.g. 74.7421"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
        </div>
      </div>

      {addMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>Failed to add POI. Please try again.</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={addMutation.isPending || !name.trim() || !category}
        className="w-full"
      >
        {addMutation.isPending ? 'Adding…' : 'Add POI'}
      </Button>
    </form>
  );
}

interface PoiManagerProps {
  listingId: string;
}

export function PoiManager({ listingId }: PoiManagerProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('suggestions');

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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pois', 'suggestions', listingId] });
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

  const approvedPois = (pois ?? [])
    .filter((p) => p.approved)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const da = a.distanceMeters ?? Infinity;
      const db = b.distanceMeters ?? Infinity;
      return da - db;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nearby Points of Interest</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="add">Add Manual</TabsTrigger>
          </TabsList>

          {/* Suggestions tab */}
          <TabsContent value="suggestions">
            {isLoading && <SkeletonRows />}
            {isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to load POI suggestions. Please refresh and try again.
                </AlertDescription>
              </Alert>
            )}
            {!isLoading && !isError && (pois ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No POI suggestions found for this listing.
              </p>
            )}
            {!isLoading && !isError && (pois ?? []).length > 0 && (
              <div>
                {(pois ?? []).map((poi) => (
                  <PoiRow
                    key={poi.id}
                    poi={poi}
                    showApprove={!poi.approved}
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
          </TabsContent>

          {/* Add Manual tab */}
          <TabsContent value="add">
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
