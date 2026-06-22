import React from 'react';
import { Building2, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import { getAreaGroupContent } from '@/lib/discoverGroupContent';

interface AreaIndicatorOverlayProps {
  /** Human-readable city label (e.g. "Udupi / Manipal"). */
  cityLabel: string;
  /** Currently focused group, or null when no group is selected. */
  focusedGroup: AreaGroup | null;
  /** Currently selected area, or null when no area is selected. */
  selectedArea: AreaPoint | null;
  className?: string;
}

/**
 * Floating top-left map overlay that shows the current navigation context.
 *
 * Render priority (highest first):
 *   area state  → Building2 icon + bold area label + xs city subline
 *   group state → MapPin icon + bold group name + xs subtitle
 *   city state  → MapPin icon + city label (matches legacy chip styling)
 */
export function AreaIndicatorOverlay({
  cityLabel,
  focusedGroup,
  selectedArea,
  className,
}: AreaIndicatorOverlayProps) {
  if (selectedArea) {
    return (
      <Card
        className={cn(
          'flex flex-col px-3 py-2 shadow-sm select-none',
          className,
        )}
        data-testid="area-indicator-overlay"
        data-state="area"
      >
        <div className="flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold truncate max-w-[180px]">
            {selectedArea.areaLabel}
          </span>
        </div>
        <span className="text-xs text-muted-foreground mt-0.5 ml-5 leading-none">
          {cityLabel}
        </span>
      </Card>
    );
  }

  if (focusedGroup) {
    // Data-driven subtitle: backend subtitle first, then a safe frontend metadata
    // fallback (region label) for known groups, then a conservative generic string.
    // Never a single hardcoded group-specific descriptor (Issue #1595).
    const groupSubtitle =
      focusedGroup.subtitle?.trim() ||
      focusedGroup.region_label?.trim() ||
      getAreaGroupContent(focusedGroup.id)?.regionLabel ||
      'Neighbourhood group';
    return (
      <Card
        className={cn(
          'flex flex-col px-3 py-2 shadow-sm select-none',
          className,
        )}
        data-testid="area-indicator-overlay"
        data-state="group"
      >
        <div className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold truncate max-w-[180px]">
            {focusedGroup.name}
          </span>
        </div>
        <span className="text-xs text-muted-foreground mt-0.5 ml-5 leading-none truncate max-w-[180px]">
          {groupSubtitle}
        </span>
      </Card>
    );
  }

  // City state — matches legacy chip styling
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 bg-card rounded-full px-3 py-2 shadow-sm border border-border text-sm font-medium select-none',
        className,
      )}
      data-testid="area-indicator-overlay"
      data-state="city"
    >
      <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
      <span>{cityLabel}</span>
    </div>
  );
}
