import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, Check, Loader2, MapPin as MapPinIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NominatimResult } from '@/lib/geocode';
import type { UseResidentialLocationResult } from '@/components/broker/residential/useResidentialLocation';

// ---------------------------------------------------------------------------
// Issue #1722 correction #4 — Section 2 ("Where is it?") thin view over the
// shared useResidentialLocation hook. Resolving a location here (search
// result or browser location) also enables the Section 6 <MapPin> CTA,
// since both views share the SAME hook instance.
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 400;

export interface AddressSearchProps {
  location: UseResidentialLocationResult;
}

export function AddressSearch({ location }: AddressSearchProps) {
  const { state, geoError, findDisabled, runSearch, selectResult, requestGeo, allowGeo, dismissGeo, editQuery, clear } = location;
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setShowResults(state.status === 'results' || state.status === 'notfound');
  }, [state.status]);

  const handleChange = useCallback(
    (value: string) => {
      editQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) return;
      debounceRef.current = setTimeout(() => void runSearch(value), SEARCH_DEBOUNCE_MS);
    },
    [editQuery, runSearch],
  );

  const handleFindLocation = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!state.query.trim()) return;
    void runSearch(state.query);
  }, [runSearch, state.query]);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFindLocation();
      }
    },
    [handleFindLocation],
  );

  const handleUseResult = useCallback(
    (result: NominatimResult) => {
      selectResult(result);
      setShowResults(false);
    },
    [selectResult],
  );

  const isResolved = state.status === 'resolved' && state.resolved != null;

  return (
    <div className="space-y-3">
      <div className="relative" ref={wrapperRef}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="locality"
              placeholder="Search for a location (e.g. Manipal, Udupi)"
              value={state.query}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => (state.status === 'results' || state.status === 'notfound') && setShowResults(true)}
              className="h-11 pl-9 pr-9"
              aria-label="Search for a location"
            />
            {state.status === 'searching' && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <Button type="button" className="h-11 shrink-0" onClick={handleFindLocation} disabled={findDisabled || isResolved}>
            Find location
          </Button>
        </div>

        {showResults && !isResolved && (
          <ul className="absolute z-[1100] mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
            {state.status === 'results' && state.results.length > 0 ? (
              state.results.map((r, i) => (
                <li
                  key={`${r.lat}-${r.lon}-${i}`}
                  className="flex items-center justify-between gap-2 px-3 py-3 text-sm hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{r.display_name}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => handleUseResult(r)}
                  >
                    Use
                  </Button>
                </li>
              ))
            ) : state.status === 'notfound' ? (
              <li className="flex items-start gap-2 px-3 py-3 text-sm text-amber-800" role="alert">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" aria-hidden="true" />
                <span>
                  No results for &quot;{state.query}&quot;. Try adding a landmark, road name, or PIN code.
                </span>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {!isResolved && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={requestGeo}
          disabled={state.geoPermission === 'locating'}
        >
          {state.geoPermission === 'locating' ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
              Getting location…
            </>
          ) : (
            <>
              <MapPinIcon className="mr-1 h-3 w-3" aria-hidden="true" />
              Use my current location
            </>
          )}
        </Button>
      )}

      {/* AC-4.5 — rationale card shown BEFORE navigator.geolocation is ever called. */}
      {state.geoPermission === 'prompt' && (
        <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm" role="dialog" aria-label="Use current location">
          <p className="text-foreground">
            Use your current location to find your property faster? This is optional — you can always search
            manually instead.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={allowGeo}>
              Allow
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismissGeo}>
              Not now
            </Button>
          </div>
        </div>
      )}

      {geoError && (
        <p role="alert" className="text-sm text-destructive">
          {geoError}
        </p>
      )}

      {isResolved && state.resolved ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-green-700">
              <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Location confirmed — {state.resolved.formatted}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clear}
            >
              Change
            </Button>
          </div>
          {/* Privacy caption (contract §H) — restates what buyers actually see. */}
          <p className="text-xs text-muted-foreground" data-testid="address-search-privacy-caption">
            Buyers see only &quot;{state.resolved.publicLoc}&quot;.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Search above or use your current location, then choose &quot;Use&quot; to confirm a starting point.
        </p>
      )}
    </div>
  );
}
