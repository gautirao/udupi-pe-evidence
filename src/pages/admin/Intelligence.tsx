import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { AlertCircle, BarChart2, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = 'full' | 'limited' | 'insufficient';

interface AreaTopGap {
  propertyType: string;
  listingPurpose: string;
  budgetBand: string;
  signalType: string;
  gapScore: number;
  confidence: string;
}

interface AreaIntelligenceRow {
  areaKey: string;
  areaLabel: string | null;
  district: string | null;
  live90dCount: number;
  scoredListingCount: number;
  avgQualityScore: number | null;
  confidence: Confidence;
  demandEventCount: number | null;
  topGaps: AreaTopGap[] | null;
}

type SortKey = 'live90dCount' | 'avgQualityScore' | 'demandEventCount' | 'topGapScore';
type SortDir = 'asc' | 'desc';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUERY_KEY_BASE = ['admin', 'intelligence', 'areas'] as const;

const CONFIDENCE_BADGE: Record<
  Confidence,
  { label: string; className: string }
> = {
  full:         { label: 'Full',        className: 'bg-green-100 text-green-800' },
  limited:      { label: 'Limited',     className: 'bg-yellow-100 text-yellow-800' },
  insufficient: { label: 'Insufficient', className: 'bg-amber-100 text-amber-800 font-semibold border border-amber-400' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceBadge(confidence: Confidence) {
  const cfg = CONFIDENCE_BADGE[confidence] ?? CONFIDENCE_BADGE.insufficient;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

/** Null-last numeric comparator. Returns negative/0/positive. */
function compareNullLast(
  a: number | null,
  b: number | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;   // nulls always last regardless of dir
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Intelligence() {
  const [cityFilter, setCityFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('live90dCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: rows, isLoading, isError, error, refetch } = useQuery<
    AreaIntelligenceRow[]
  >({
    queryKey: QUERY_KEY_BASE,
    queryFn: () => api.get<AreaIntelligenceRow[]>('/api/admin/intelligence/areas'),
    staleTime: 60_000,
  });

  // Unique district values for the city filter dropdown
  const districts = useMemo(() => {
    if (!rows) return [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.district) seen.add(r.district);
    }
    return Array.from(seen).sort();
  }, [rows]);

  // Filter then sort — both client-side over the fetched rows
  const displayRows = useMemo(() => {
    if (!rows) return [];
    const filtered = cityFilter
      ? rows.filter((r) => r.district === cityFilter)
      : rows;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'avgQualityScore') {
        return compareNullLast(a.avgQualityScore, b.avgQualityScore, sortDir);
      }
      if (sortKey === 'demandEventCount') {
        return compareNullLast(a.demandEventCount, b.demandEventCount, sortDir);
      }
      if (sortKey === 'topGapScore') {
        const aScore = (a.topGaps && a.topGaps.length > 0)
          ? Math.max(...a.topGaps.map((g) => g.gapScore ?? 0))
          : null;
        const bScore = (b.topGaps && b.topGaps.length > 0)
          ? Math.max(...b.topGaps.map((g) => g.gapScore ?? 0))
          : null;
        return compareNullLast(aScore, bScore, sortDir);
      }
      // live90dCount is always a number
      return sortDir === 'asc'
        ? a.live90dCount - b.live90dCount
        : b.live90dCount - a.live90dCount;
    });
  }, [rows, cityFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return sortDir === 'desc' ? ' ▼' : ' ▲';
  }

  return (
    <AppLayout>
      <div className="container max-w-7xl py-8 px-4">
        {/* Page header */}
        <div className="flex items-center gap-2 mb-2">
          <BarChart2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Intelligence Validator</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Admin-only quality + confidence view per area. Demand columns are
          populated from demand-signal data; "—" indicates areas with
          insufficient signal (below k-anonymity threshold).
        </p>

        {/* City filter */}
        <div className="flex items-center gap-3 mb-4">
          <label htmlFor="city-filter" className="text-sm font-medium">
            Filter by city / district
          </label>
          <select
            id="city-filter"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center py-20" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading intelligence data" />
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div
            className="flex flex-col items-center gap-3 py-20 text-destructive"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm font-medium">
              Failed to load intelligence data.{' '}
              {error instanceof Error ? error.message : 'Unknown error.'}
            </p>
            <button
              onClick={() => refetch()}
              className="text-sm underline underline-offset-2 hover:opacity-80"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && displayRows.length === 0 && (
          <div
            className="flex flex-col items-center gap-2 py-20 text-muted-foreground"
            data-testid="intelligence-empty-state"
          >
            <BarChart2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">
              {cityFilter
                ? `No areas found for district "${cityFilter}".`
                : 'No area intelligence data available yet.'}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && !isError && displayRows.length > 0 && (
          <div className="rounded-md border overflow-x-auto" data-testid="intelligence-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead>City / District</TableHead>
                  <TableHead>
                    <button
                      onClick={() => toggleSort('live90dCount')}
                      className="text-left font-medium hover:text-foreground focus:outline-none"
                      aria-label="Sort by LIVE 90d count"
                    >
                      LIVE (90d){sortIndicator('live90dCount')}
                    </button>
                  </TableHead>
                  <TableHead>Scored</TableHead>
                  <TableHead>
                    <button
                      onClick={() => toggleSort('avgQualityScore')}
                      className="text-left font-medium hover:text-foreground focus:outline-none"
                      aria-label="Sort by average quality score"
                    >
                      Avg quality{sortIndicator('avgQualityScore')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => toggleSort('demandEventCount')}
                      className="text-left font-medium hover:text-foreground focus:outline-none"
                      aria-label="Sort by demand events"
                    >
                      Demand events{sortIndicator('demandEventCount')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => toggleSort('topGapScore')}
                      className="text-left font-medium hover:text-foreground focus:outline-none"
                      aria-label="Sort by top gap score"
                    >
                      Top gaps{sortIndicator('topGapScore')}
                    </button>
                  </TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row) => (
                  <TableRow
                    key={row.areaKey}
                    data-confidence={row.confidence}
                    className={
                      row.confidence === 'insufficient'
                        ? 'bg-amber-50/60'
                        : undefined
                    }
                  >
                    {/* Area — label + key */}
                    <TableCell>
                      <span className="font-medium">
                        {row.areaLabel ?? row.areaKey}
                      </span>
                      <br />
                      <span className="text-xs text-muted-foreground font-mono">
                        {row.areaKey}
                      </span>
                    </TableCell>

                    {/* City / district */}
                    <TableCell>{row.district ?? '—'}</TableCell>

                    {/* LIVE (90d) count */}
                    <TableCell className="tabular-nums">
                      {row.live90dCount}
                    </TableCell>

                    {/* Scored count (coverage denominator) */}
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.scoredListingCount}
                    </TableCell>

                    {/* Avg quality — null = backfill incomplete */}
                    <TableCell className="tabular-nums">
                      {row.avgQualityScore !== null
                        ? row.avgQualityScore.toFixed(1)
                        : <span className="text-muted-foreground italic text-xs">unavailable</span>}
                    </TableCell>

                    {/* Demand events — null = suppressed (k-anon) */}
                    <TableCell className="tabular-nums" data-testid="cell-demand-events">
                      {row.demandEventCount !== null
                        ? row.demandEventCount
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    {/* Top gaps — null or empty = suppressed */}
                    <TableCell data-testid="cell-top-gaps">
                      {row.topGaps && row.topGaps.length > 0
                        ? (
                          <ul className="space-y-0.5">
                            {row.topGaps.slice(0, 3).map((gap, i) => (
                              <li key={i} className="text-xs leading-tight">
                                <span className="font-medium">{gap.budgetBand}</span>
                                {' · '}{gap.propertyType}
                                {' · '}{gap.signalType}
                                {' '}
                                <span className="text-muted-foreground">
                                  ({(gap.gapScore ?? 0).toFixed(1)})
                                </span>
                              </li>
                            ))}
                          </ul>
                        )
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    {/* Confidence badge */}
                    <TableCell>{confidenceBadge(row.confidence)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* K-anonymity notice */}
        <p className="mt-4 text-xs text-muted-foreground">
          Rows flagged <strong>Insufficient</strong> (live90d &lt; 10) are not
          externally publishable per k-anonymity policy.
        </p>
      </div>
    </AppLayout>
  );
}
