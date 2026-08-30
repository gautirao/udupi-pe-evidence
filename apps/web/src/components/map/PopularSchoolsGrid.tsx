import { useState } from 'react';
import { AlertCircle, GraduationCap, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { usePopularSchools } from '@/hooks/usePopularSchools';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { PopularSchoolCard } from '@/components/map/PopularSchoolCard';

export interface PopularSchoolsGridProps {
  /**
   * City slug (e.g. "udupi"). When `null`/empty the grid renders a placeholder
   * prompting the user to pick a city — the API is NOT called.
   */
  city: string | null;
  /** Currently-selected school (highlighted in the grid). */
  selectedSchool: SchoolResult | null;
  /** Called when a card is clicked. The grid never mutates global state itself. */
  onSchoolSelect: (school: SchoolResult) => void;
  /** Max popular schools to show. Backend clamps to [1, 50]. */
  limit?: number;
}

const ALL_AREAS_VALUE = '__all__';

/**
 * Local-state grid of "popular" schools for a city, with an optional area
 * narrowing dropdown.
 *
 * IMPORTANT: the area dropdown is intentionally LOCAL state. It does NOT sync
 * with the parent `selectedArea` or the URL `areaKey` — clicking a card calls
 * `onSchoolSelect(school)` only. This keeps the sheet a self-contained
 * "explore schools" surface without hijacking the user's main map filter.
 */
export function PopularSchoolsGrid({
  city,
  selectedSchool,
  onSchoolSelect,
  limit = 6,
}: PopularSchoolsGridProps) {
  // Local-only: never propagated to the parent.
  const [localAreaKey, setLocalAreaKey] = useState<string>('');

  // Reset the local dropdown when the city changes — otherwise an areaKey from
  // city A would be sent with city B and the backend would 404.
  // We track the previous city in a small `useState` rather than `useEffect`
  // so the reset is synchronous with render (no stale-frame flash).
  const [lastCity, setLastCity] = useState<string | null>(city);
  if (city !== lastCity) {
    setLastCity(city);
    if (localAreaKey !== '') setLocalAreaKey('');
  }

  const { data: trendsOpts } = useTrendsOptions(city ?? '', !!city, 50);

  const {
    data: schools,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = usePopularSchools(city, localAreaKey || undefined, limit);

  // ─── No-city placeholder ──────────────────────────────────────
  if (!city) {
    return (
      <section aria-labelledby="popular-schools-heading" className="space-y-2">
        <h3
          id="popular-schools-heading"
          className="text-sm font-medium flex items-center gap-1.5"
        >
          <GraduationCap className="h-3.5 w-3.5" />
          Popular schools
        </h3>
        <div className="rounded-md border border-dashed border-border p-4 text-center">
          <MapPin className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">
            Enter a location first to see popular schools.
          </p>
        </div>
      </section>
    );
  }

  const areaOptions = trendsOpts?.defaultAreas ?? [];

  return (
    <section aria-labelledby="popular-schools-heading" className="space-y-3">
      <h3
        id="popular-schools-heading"
        className="text-sm font-medium flex items-center gap-1.5"
      >
        <GraduationCap className="h-3.5 w-3.5" />
        Popular schools
      </h3>

      {/* Local area narrowing — NOT linked to global selectedArea/URL */}
      {areaOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="popular-schools-area" className="text-xs text-muted-foreground">
            Filter by area
          </Label>
          <Select
            value={localAreaKey === '' ? ALL_AREAS_VALUE : localAreaKey}
            onValueChange={(v) =>
              setLocalAreaKey(v === ALL_AREAS_VALUE ? '' : v)
            }
          >
            <SelectTrigger id="popular-schools-area" className="h-8 text-xs">
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AREAS_VALUE}>All areas</SelectItem>
              {areaOptions.map((opt) => (
                <SelectItem key={opt.areaKey} value={opt.areaKey}>
                  {opt.areaLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Live region so screen readers announce loading/empty/error transitions */}
      <div aria-live="polite" aria-busy={isLoading || isFetching}>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-foreground">
                  Couldn’t load schools. Please try again.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 mt-2 text-xs"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      Retrying…
                    </>
                  ) : (
                    'Retry'
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : !schools || schools.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">
              No popular schools found near {city}.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2">
            {schools.map((school) => (
              <li key={school.id}>
                <PopularSchoolCard
                  school={school}
                  isSelected={selectedSchool?.id === school.id}
                  onSelect={onSchoolSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
