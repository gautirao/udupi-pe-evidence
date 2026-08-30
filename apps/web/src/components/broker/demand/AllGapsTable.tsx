/**
 * AllGapsTable — client-side filterable + sortable table of all demand gaps.
 *
 * AC4: allGaps[], client-side sort by gapScore + client-side area/propType/budget filters.
 * AC6: honest empty state.
 * AC10: dismiss/read only when id !== null.
 *
 * IMPORTANT: null gapScore rows sort to the bottom (never NaN/crash).
 */

import { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendingUp, Eye, X, AlertCircle } from 'lucide-react';
import type { GapItem, SignalType, ActionType } from '@/hooks/useBrokerDemandGaps';
import { useMarkGapRead, useDismissGap } from '@/hooks/useBrokerDemandGaps';

// ── Label maps ─────────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<SignalType, string> = {
  supply_gap: 'Supply Gap',
  information_gap: 'Info Gap',
  price_signal: 'Price Signal',
  possible_gap: 'Possible Gap',
};

// Matches TopGapCards SIGNAL_TYPE_BADGE_CLASS — kept in sync so signal types are
// visually consistent across both card and table views.
const SIGNAL_BADGE_CLASS: Record<SignalType, string> = {
  supply_gap: 'bg-destructive/10 text-destructive border-destructive/20',
  information_gap: 'bg-secondary text-secondary-foreground border-secondary',
  price_signal: 'bg-copper-tint text-copper border-copper/20',
  possible_gap: 'bg-muted text-muted-foreground border-muted',
};

const ACTION_LABELS: Record<ActionType, string> = {
  add_listing: 'Add Listing',
  improve_listing: 'Improve Listing',
  review_gap: 'Review Gap',
};

const ACTION_BADGE_CLASS: Record<ActionType, string> = {
  add_listing: 'bg-evergreen-tint text-evergreen border-evergreen/20',
  improve_listing: 'bg-secondary text-secondary-foreground border-secondary',
  review_gap: 'bg-copper-tint text-copper border-copper/20',
};

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

/**
 * Null-safe comparator for gapScore. Nulls always sort last regardless of direction.
 */
function compareGapScore(a: GapItem, b: GapItem, dir: SortDir): number {
  const aVal = a.gapScore.value;
  const bVal = b.gapScore.value;
  if (aVal === null && bVal === null) return 0;
  if (aVal === null) return 1;   // null → last
  if (bVal === null) return -1;  // null → last
  return dir === 'desc' ? bVal - aVal : aVal - bVal;
}

// ── Filter options (derived from data) ───────────────────────────────────────

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

// ── Row component ─────────────────────────────────────────────────────────────

interface GapRowProps {
  gap: GapItem;
}

function GapRow({ gap }: GapRowProps) {
  const markRead = useMarkGapRead();
  const dismiss = useDismissGap();
  const hasId = gap.id !== null;
  const isRead = gap.readAt !== null;

  const gapScoreDisplay =
    gap.gapScore.value !== null
      ? gap.gapScore.value.toFixed(1)
      : <span className="italic text-muted-foreground text-xs">{gap.gapScore.confidenceLabel}</span>;

  const demandDisplay =
    gap.buyerEnquiries.value !== null
      ? gap.buyerEnquiries.value
      : <span className="italic text-muted-foreground text-xs">{gap.buyerEnquiries.confidenceLabel}</span>;

  return (
    <TableRow className={isRead ? 'opacity-60' : undefined}>
      <TableCell className="text-xs font-medium">{gap.areaKey}</TableCell>
      <TableCell className="text-xs">{gap.propertyType}</TableCell>
      <TableCell className="text-xs">{gap.budgetBand}</TableCell>
      <TableCell className="text-xs font-medium">{demandDisplay}</TableCell>
      <TableCell className="text-xs">{gapScoreDisplay}</TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-xs ${SIGNAL_BADGE_CLASS[gap.signalType]}`}>
          {SIGNAL_LABELS[gap.signalType]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-xs ${ACTION_BADGE_CLASS[gap.actionType]}`}>
          {ACTION_LABELS[gap.actionType]}
        </Badge>
      </TableCell>
      {/* dismiss/read — omit entirely when id === null */}
      <TableCell>
        {hasId && (
          <div className="flex items-center gap-1">
            {!isRead && (
              <button
                type="button"
                aria-label="Mark as read"
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={() => markRead.mutate(gap.id as string)}
                // Disable while EITHER mutation is in-flight to prevent dual-mutation race
                disabled={markRead.isPending || dismiss.isPending}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss gap"
              className="text-muted-foreground hover:text-destructive disabled:opacity-40"
              onClick={() => dismiss.mutate(gap.id as string)}
              // Disable while EITHER mutation is in-flight to prevent dual-mutation race
              disabled={markRead.isPending || dismiss.isPending}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

interface AllGapsTableProps {
  gaps: GapItem[];
  /** When true, shows a fetch-failure alert rather than blank/empty state */
  isError?: boolean;
  onRetry?: () => void;
}

// Radix UI Select.Item disallows value="". Use a sentinel for the "All" option.
const ALL_SENTINEL = '__all__';

export function AllGapsTable({ gaps, isError, onRetry }: AllGapsTableProps) {
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterArea, setFilterArea] = useState(ALL_SENTINEL);
  const [filterPropertyType, setFilterPropertyType] = useState(ALL_SENTINEL);
  const [filterBudget, setFilterBudget] = useState(ALL_SENTINEL);

  // Derive filter options from data (client-side only — no network on filter change)
  const areaOptions = useMemo(() => uniqueSorted(gaps.map((g) => g.areaKey)), [gaps]);
  const propertyTypeOptions = useMemo(() => uniqueSorted(gaps.map((g) => g.propertyType)), [gaps]);
  const budgetOptions = useMemo(() => uniqueSorted(gaps.map((g) => g.budgetBand)), [gaps]);

  // Apply filters then sort — sentinel means "no filter applied"
  const filtered = useMemo(() => {
    return gaps
      .filter((g) => filterArea === ALL_SENTINEL || g.areaKey === filterArea)
      .filter((g) => filterPropertyType === ALL_SENTINEL || g.propertyType === filterPropertyType)
      .filter((g) => filterBudget === ALL_SENTINEL || g.budgetBand === filterBudget);
  }, [gaps, filterArea, filterPropertyType, filterBudget]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareGapScore(a, b, sortDir)),
    [filtered, sortDir],
  );

  function toggleSort() {
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>Couldn't load demand gaps. Check your connection and try again.</span>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              className="ml-4 flex-shrink-0 border-destructive text-destructive hover:bg-destructive/10"
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (gaps.length === 0) {
    return (
      <div className="py-10">
        <EmptyState
          icon={<TrendingUp className="h-7 w-7 text-muted-foreground" />}
          heading="No demand gaps found"
          description="As buyer activity grows in your areas, gap signals will appear here."
          size="sm"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters — client-side only */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>All areas</SelectItem>
            {areaOptions.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPropertyType} onValueChange={setFilterPropertyType}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="All property types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>All property types</SelectItem>
            {propertyTypeOptions.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterBudget} onValueChange={setFilterBudget}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="All budgets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>All budgets</SelectItem>
            {budgetOptions.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(filterArea !== ALL_SENTINEL || filterPropertyType !== ALL_SENTINEL || filterBudget !== ALL_SENTINEL) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setFilterArea(ALL_SENTINEL);
              setFilterPropertyType(ALL_SENTINEL);
              setFilterBudget(ALL_SENTINEL);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Empty state after filters */}
      {sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No gaps match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Area</TableHead>
                <TableHead className="text-xs">Property Type</TableHead>
                <TableHead className="text-xs">Budget Band</TableHead>
                <TableHead className="text-xs">Buyer Need</TableHead>
                {/* aria-sort on <th> announces direction to screen readers.
                    Inner <button> makes the control keyboard-operable (Enter/Space). */}
                <TableHead
                  className="text-xs"
                  aria-sort={sortDir === 'desc' ? 'descending' : 'ascending'}
                >
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-foreground select-none"
                    onClick={toggleSort}
                    aria-label={`Sort by gap score, currently ${sortDir === 'desc' ? 'descending' : 'ascending'}`}
                  >
                    Gap Score
                    <span aria-hidden="true">{sortDir === 'desc' ? '↓' : '↑'}</span>
                  </button>
                </TableHead>
                <TableHead className="text-xs">Signal</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs w-16">Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((gap, idx) => (
                <GapRow key={gap.id ?? `gap-row-${idx}`} gap={gap} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
