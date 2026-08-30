import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Loader2, Trash2, X } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';

interface SavedAreaResponse {
  id: string;
  areaKey: string;
  areaLabel: string | null;
  createdAt: string | null;
  alertsEnabled: boolean;
  priceThresholdRupees: number | null;
}

function formatRupees(val: number): string {
  if (val >= 10_000_000) return `₹${(val / 10_000_000).toFixed(1)} Cr`;
  if (val >= 100_000) return `₹${(val / 100_000).toFixed(1)} L`;
  return `₹${val.toLocaleString('en-IN')}`;
}

function ThresholdInput({
  areaId,
  initialValue,
  onSave,
}: {
  areaId: string;
  initialValue: number | null;
  onSave: (id: string, value: number | null) => void;
}) {
  const [raw, setRaw] = useState(initialValue != null ? String(initialValue) : '');

  function commit() {
    const stripped = raw.trim().replace(/[₹,\s]/g, '');
    if (stripped === '') {
      onSave(areaId, null);
    } else {
      const parsed = parseInt(stripped, 10);
      if (!isNaN(parsed) && parsed > 0) {
        onSave(areaId, parsed);
      } else {
        setRaw(initialValue != null ? String(initialValue) : '');
      }
    }
  }

  function clear() {
    setRaw('');
    onSave(areaId, null);
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground hidden sm:inline">Max ₹</span>
      <div className="relative flex items-center">
        <Input
          className="h-7 w-28 text-xs pr-6"
          placeholder="no limit"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          title={raw && !isNaN(parseInt(raw, 10)) ? formatRupees(parseInt(raw, 10)) : undefined}
        />
        {raw && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear threshold"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function useSavedAreas() {
  return useQuery<SavedAreaResponse[]>({
    queryKey: ['saved-areas'],
    queryFn: () => api.get<SavedAreaResponse[]>('/api/saved-areas'),
  });
}

/**
 * "My Saved Areas" page — lists saved areas with per-area alert toggles.
 */
export default function SavedAreas() {
  const queryClient = useQueryClient();
  const { data: areas, isLoading } = useSavedAreas();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/saved-areas/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-areas'] }),
  });

  const alertsMutation = useMutation({
    mutationFn: ({ id, alertsEnabled }: { id: string; alertsEnabled: boolean }) =>
      api.patch<SavedAreaResponse>(`/api/saved-areas/${id}/alerts`, { alertsEnabled }),
    onSuccess: (updated) => {
      queryClient.setQueryData<SavedAreaResponse[]>(['saved-areas'], (prev) =>
        prev?.map((a) => (a.id === updated.id ? updated : a)) ?? [],
      );
    },
  });

  const thresholdMutation = useMutation({
    mutationFn: ({ id, priceThresholdRupees }: { id: string; priceThresholdRupees: number | null }) =>
      api.patch<SavedAreaResponse>(`/api/saved-areas/${id}/threshold`, { priceThresholdRupees }),
    onSuccess: (updated) => {
      queryClient.setQueryData<SavedAreaResponse[]>(['saved-areas'], (prev) =>
        prev?.map((a) => (a.id === updated.id ? updated : a)) ?? [],
      );
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-2xl py-12 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Saved Areas</h1>
          <Button variant="outline" asChild>
            <Link to="/trends">View Trends</Link>
          </Button>
        </div>

        {!areas || areas.length === 0 ? (
          <p className="text-muted-foreground">
            No saved areas yet. Save an area from the{' '}
            <Link to="/trends" className="underline underline-offset-2">
              Trends
            </Link>{' '}
            page to get notified when new listings appear.
          </p>
        ) : (
          <ul className="space-y-3">
            {areas.map((area) => (
              <li
                key={area.id}
                className="flex items-center justify-between rounded-lg border p-4 bg-card"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {area.alertsEnabled ? (
                    <Bell className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium truncate">
                    {area.areaLabel ?? area.areaKey}
                  </span>
                </div>

                <div className="flex items-center gap-4 shrink-0 ml-4">
                  {area.alertsEnabled && (
                    <ThresholdInput
                      areaId={area.id}
                      initialValue={area.priceThresholdRupees}
                      onSave={(id, value) =>
                        thresholdMutation.mutate({ id, priceThresholdRupees: value })
                      }
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Alerts
                    </span>
                    <Switch
                      checked={area.alertsEnabled}
                      disabled={alertsMutation.isPending}
                      onCheckedChange={(checked) =>
                        alertsMutation.mutate({ id: area.id, alertsEnabled: checked })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(area.id)}
                    aria-label="Remove saved area"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
