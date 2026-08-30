import { ArrowUpDown } from 'lucide-react';
import { FILTER_CHIPS, type FilterKey, type SortKey } from '@/pages/broker/listingQualityModel';
import type { ListingQualityAggregates } from '@/types/listingQuality';

interface QualityFilterBarProps {
  filterCounts: ListingQualityAggregates['filterCounts'] | undefined;
  activeFilter: FilterKey;
  onSelectFilter: (filter: FilterKey) => void;
  sortKey: SortKey;
  onSelectSort: (sortKey: SortKey) => void;
}

export function QualityFilterBar({
  filterCounts,
  activeFilter,
  onSelectFilter,
  sortKey,
  onSelectSort,
}: QualityFilterBarProps) {
  return (
    <>
      {/* Filter chips */}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter listings">
        {FILTER_CHIPS.map(chip => {
          // Counts come from the server — never recomputed client-side.
          const rawCount: number | undefined = filterCounts
            ? chip.key === 'all'
              ? filterCounts.all
              : chip.key === 'buyerReady'
              ? filterCounts.buyerReady
              : chip.key === 'needImprovement'
              ? filterCounts.needImprovement
              : chip.key === 'priorityFix'
              ? filterCounts.priorityFix
              : chip.key === 'notScored'
              ? filterCounts.notScored
              : undefined
            : undefined;

          const isActive = activeFilter === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => onSelectFilter(chip.key)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {chip.label}
              {rawCount !== undefined && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {rawCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sort control */}
      <div className="mt-3 flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Sort by:</span>
        {(['band', 'score', 'title'] as SortKey[]).map(key => (
          <button
            key={key}
            onClick={() => onSelectSort(key)}
            className={`text-sm px-2 py-1 rounded transition-colors ${
              sortKey === key
                ? 'font-semibold text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {key === 'band' ? 'Priority' : key === 'score' ? 'Score' : 'Name'}
          </button>
        ))}
      </div>
    </>
  );
}
