import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, X, AlertCircle } from 'lucide-react';
import { useSavedAreas, useDeleteSavedArea } from '@/hooks/useSavedAreas';
import { formatRelativeDate } from '@/lib/formatters';

export function SavedAreas() {
  const { data: savedAreas = [], isLoading, error } = useSavedAreas();
  const deleteMutation = useDeleteSavedArea();

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Areas</CardTitle>
          <CardDescription>Areas you're tracking for insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Areas</CardTitle>
          <CardDescription>Areas you're tracking for insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Failed to load saved areas</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Areas</CardTitle>
        <CardDescription>
          {savedAreas.length === 0
            ? 'No saved areas yet. Save areas to see personalized insights.'
            : `Tracking ${savedAreas.length} area${savedAreas.length !== 1 ? 's' : ''}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {savedAreas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              Save areas from the map or insights to start tracking
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {savedAreas.map((area) => (
              <div
                key={area.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {area.areaLabel || area.areaKey}
                    </p>
                    {area.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        Saved {formatRelativeDate(area.createdAt)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => handleDelete(area.id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending && deleteMutation.variables === area.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
