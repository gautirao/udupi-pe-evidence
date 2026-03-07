import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Pin, Trash2, Check, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ---- Types ----------------------------------------------------------------

interface PoiItem {
  id: string;
  name: string;
  category: string;
  distanceMeters: number;
  latitude: number;
  longitude: number;
  pinned: boolean;
  approved?: boolean;
  source?: string;
}

const POI_CATEGORIES = [
  'WORSHIP', 'HOSPITAL', 'SCHOOL', 'HOTEL', 'TRANSPORT', 'AIRPORT', 'GROCERY',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  WORSHIP: 'Place of Worship',
  HOSPITAL: 'Hospital / Clinic',
  SCHOOL: 'School / University',
  HOTEL: 'Hotel / Guest House',
  TRANSPORT: 'Bus / Train Station',
  AIRPORT: 'Airport',
  GROCERY: 'Supermarket / Market',
};

// ---- Query keys -----------------------------------------------------------

const suggestionsKey = (listingId: string) => ['poi-suggestions', listingId] as const;

// ---- Sub-components -------------------------------------------------------

function DistanceBadge({ meters }: { meters: number }) {
  const label = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="secondary" className="text-xs">
      {CATEGORY_LABELS[category] ?? category}
    </Badge>
  );
}

// ---- Main component -------------------------------------------------------

interface PoiManagerProps {
  listingId: string;
}

export function PoiManager({ listingId }: PoiManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch suggestions (triggers Overpass if cache miss)
  const { data: allPois = [], isLoading: loading } = useQuery({
    queryKey: suggestionsKey(listingId),
    queryFn: () => api.get<PoiItem[]>(`/api/listings/${listingId}/pois/suggestions`),
    staleTime: 5 * 60 * 1000,
  });

  const unapproved = allPois.filter((p) => !p.approved);
  const approved = allPois.filter((p) => p.approved);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: suggestionsKey(listingId) });

  // Approve
  const approveMutation = useMutation({
    mutationFn: (poiId: string) =>
      api.patch(`/api/listings/${listingId}/pois/${poiId}/approve`),
    onSuccess: () => { invalidate(); toast({ title: 'POI approved' }); },
    onError: () => toast({ title: 'Approve failed', variant: 'destructive' }),
  });

  // Pin toggle
  const pinMutation = useMutation({
    mutationFn: (poiId: string) =>
      api.patch(`/api/listings/${listingId}/pois/${poiId}/pin`),
    onSuccess: () => { invalidate(); },
    onError: () => toast({ title: 'Pin update failed', variant: 'destructive' }),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: (poiId: string) =>
      api.delete(`/api/listings/${listingId}/pois/${poiId}`),
    onSuccess: () => { invalidate(); toast({ title: 'POI removed' }); },
    onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Nearby POIs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching nearby places…
          </div>
        ) : (
          <Tabs defaultValue="suggestions">
            <TabsList className="mb-4">
              <TabsTrigger value="suggestions">
                Suggestions {unapproved.length > 0 && `(${unapproved.length})`}
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved {approved.length > 0 && `(${approved.length})`}
              </TabsTrigger>
              <TabsTrigger value="manual">Add Manual</TabsTrigger>
            </TabsList>

            {/* ---- Suggestions tab ---- */}
            <TabsContent value="suggestions">
              {unapproved.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No pending suggestions. All OSM results have been reviewed.
                </p>
              ) : (
                <ul className="space-y-2">
                  {unapproved.map((poi) => (
                    <li
                      key={poi.id}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{poi.name}</span>
                        <div className="flex items-center gap-2">
                          <CategoryBadge category={poi.category} />
                          <DistanceBadge meters={poi.distanceMeters} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMutation.mutate(poi.id)}
                          disabled={approveMutation.isPending}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(poi.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* ---- Approved tab ---- */}
            <TabsContent value="approved">
              {approved.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No approved POIs yet. Approve suggestions or add manual entries.
                </p>
              ) : (
                <ul className="space-y-2">
                  {approved.map((poi) => (
                    <li
                      key={poi.id}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{poi.name}</span>
                          {poi.pinned && (
                            <Badge className="text-xs py-0 px-1">Pinned</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <CategoryBadge category={poi.category} />
                          <DistanceBadge meters={poi.distanceMeters} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={poi.pinned ? 'default' : 'outline'}
                          onClick={() => pinMutation.mutate(poi.id)}
                          disabled={pinMutation.isPending}
                          title={poi.pinned ? 'Unpin' : 'Pin to top'}
                        >
                          <Pin className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(poi.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* ---- Add Manual tab ---- */}
            <TabsContent value="manual">
              <ManualPoiForm listingId={listingId} onAdded={invalidate} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Manual add form -------------------------------------------------------

interface ManualPoiFormProps {
  listingId: string;
  onAdded: () => void;
}

function ManualPoiForm({ listingId, onAdded }: ManualPoiFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/listings/${listingId}/pois/manual`, {
        name,
        category,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      }),
    onSuccess: () => {
      toast({ title: 'Manual POI added' });
      setName('');
      setCategory('');
      setLat('');
      setLng('');
      onAdded();
    },
    onError: () => toast({ title: 'Add failed', variant: 'destructive' }),
  });

  const isValid =
    name.trim().length > 0 &&
    category.length > 0 &&
    !isNaN(parseFloat(lat)) &&
    !isNaN(parseFloat(lng));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="poi-name">Name</Label>
        <Input
          id="poi-name"
          placeholder="e.g. Sri Anantheshwara Temple"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="poi-category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="poi-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {POI_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="poi-lat">Latitude</Label>
          <Input
            id="poi-lat"
            type="number"
            step="any"
            placeholder="13.3392"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="poi-lng">Longitude</Label>
          <Input
            id="poi-lng"
            type="number"
            step="any"
            placeholder="74.7464"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
      </div>

      <Button
        onClick={() => addMutation.mutate()}
        disabled={!isValid || addMutation.isPending}
        className="w-full"
      >
        {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Add POI
      </Button>
    </div>
  );
}
