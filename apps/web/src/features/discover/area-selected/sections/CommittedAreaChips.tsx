import { X } from 'lucide-react';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

export interface CommittedAreaChipsProps {
  selectedAreas: DiscoverArea[];
  onRemoveArea: (areaKey: string) => void;
}

/**
 * Issue #2729 R6 fix — extracted VERBATIM (identical markup, testids, classes, handler) from
 * `AreaSetSelectedHeader` (`components/discover/panels/AreaSetSelectedExtras.tsx`), the merge-base
 * committed-area chip row, so `CompactResultsHeader` (the compact desktop reskin) can render the
 * SAME chips with the SAME one-click "remove this one area" affordance instead of losing it —
 * real-browser verification found the compact header dropped these entirely, leaving no one-click
 * way to remove a single committed area (only "Clear selected areas", which clears all of them).
 * One component now, two render sites, so the two can never visually drift again.
 */
export function CommittedAreaChips({ selectedAreas, onRemoveArea }: CommittedAreaChipsProps) {
  if (selectedAreas.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Selected areas"
      data-testid="area-set-panel-committed-chips"
    >
      {selectedAreas.map((area) => (
        <span
          key={area.areaKey}
          className="inline-flex items-center gap-1 rounded-full border border-copper/40 bg-accent-tint px-2.5 py-1 text-xs font-medium text-foreground"
          data-testid={`area-set-panel-committed-chip-${area.areaKey}`}
        >
          {area.name}
          <button
            type="button"
            onClick={() => onRemoveArea(area.areaKey)}
            aria-label={`Remove ${area.name} from the selected areas`}
            data-testid={`area-set-panel-committed-chip-${area.areaKey}-dismiss`}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
