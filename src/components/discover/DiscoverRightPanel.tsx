import { MapPin } from 'lucide-react';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';

interface DiscoverRightPanelProps {
  areas: AreaPoint[];
}

export function DiscoverRightPanel({ areas }: DiscoverRightPanelProps) {
  return (
    <div
      className="hidden lg:flex flex-col w-96 border-l border-border bg-card flex-shrink-0"
      data-testid="discover-right-panel"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-semibold">Areas</h2>
        {areas.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {areas.length} areas
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {areas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No areas found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {areas.map((area) => (
              <div
                key={area.areaKey}
                className="px-4 py-3 hover:bg-accent/50 transition-colors"
                data-testid="area-card"
              >
                <p className="text-sm font-medium text-foreground">{area.areaLabel}</p>
                {area.listingCount != null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {area.listingCount.toLocaleString()} properties
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
