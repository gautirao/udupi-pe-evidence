import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, MapPin, ArrowRight, X, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import { useSchoolSearch } from '@/hooks/useSchoolSearch';

export interface ScopedSearchProps {
  /** Current search mode: 'area' | 'school' */
  searchMode?: 'area' | 'school';
  /** Callback when mode changes */
  onModeChange?: (mode: 'area' | 'school') => void;
  /** City label (e.g. "Udupi", "Bangalore") */
  cityLabel?: string;
  /** List of available areas to search within when in area mode */
  areas?: DiscoverArea[];
  /** Callback when an area is selected */
  onSelectArea?: (areaKey: string) => void;
  /** Callback when a school is selected */
  onSelectSchool?: (schoolId: string) => void;
}

export function ScopedSearch({
  searchMode: searchModeProp = 'area',
  onModeChange,
  cityLabel = 'this city',
  areas = [],
  onSelectArea,
  onSelectSchool,
}: ScopedSearchProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [localMode, setLocalMode] = useState<'area' | 'school'>(searchModeProp);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalMode(searchModeProp);
  }, [searchModeProp]);

  // Use local mode unless parent actively overrides it without navigation
  const searchMode = onModeChange ? searchModeProp : localMode;

  const handleModeSwitch = (newMode: 'area' | 'school') => {
    setQuery('');
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setLocalMode(newMode);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const matchingAreas = useMemo(() => {
    if (!query.trim() || searchMode !== 'area') return [];
    const q = query.trim().toLowerCase();
    return areas
      .filter((a) => (a.name || '').toLowerCase().includes(q) || (a.areaKey || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, areas, searchMode]);

  const { data: schoolsData = [], isLoading: isLoadingSchools } = useSchoolSearch(
    searchMode === 'school' ? query : ''
  );

  const handlePickArea = (areaKey: string) => {
    setQuery('');
    onSelectArea?.(areaKey);
  };

  const handlePickSchool = (schoolId: string) => {
    const s = schoolsData.find((item) => item.id === schoolId);
    if (s) {
      queryClient.setQueryData(['school-by-id', schoolId], s);
    }
    setQuery('');
    onSelectSchool?.(schoolId);
  };

  const cleanCity = !cityLabel || cityLabel === 'this city' ? 'city' : cityLabel;

  return (
    <div ref={containerRef} className="mb-6 relative" data-testid="scoped-search-container">
      {/* Area / School Segmented Switch */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <div className="inline-flex bg-muted rounded-full p-[3px] border border-border" role="radiogroup" aria-label="Search mode">
          {[
            ['area', 'Area'],
            ['school', 'School'],
          ].map(([k, label]) => {
            const on = searchMode === k;
            const tintClass =
              k === 'school'
                ? 'bg-purple-600 text-white shadow-sm hover:bg-purple-700'
                : 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200';
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on ? 'true' : 'false'}
                data-testid={`search-mode-${k}`}
                onClick={() => handleModeSwitch(k as 'area' | 'school')}
                className={cn(
                  'border-none cursor-pointer px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition-all',
                  on
                    ? tintClass
                    : 'bg-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder={
            searchMode === 'area'
              ? `Search ${cleanCity === 'city' ? 'areas' : `${cleanCity} areas`}…`
              : 'Search school name…'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 rounded-full border-border bg-card pl-10 pr-10 text-sm shadow-xs focus-visible:ring-ring"
          data-testid="scoped-search-input"
          aria-label={searchMode === 'area' ? `Search ${cleanCity}` : 'Search school name'}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            data-testid="scoped-search-clear"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {query.trim() && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-border bg-card shadow-lg overflow-hidden max-h-[320px] overflow-y-auto"
          data-testid="scoped-search-results"
        >
          {searchMode === 'area' ? (
            matchingAreas.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                No area matches “{query.trim()}” in {cleanCity}.
              </div>
            ) : (
              <ul className="divide-y divide-border/60" role="list">
                {matchingAreas.map((area) => {
                  const count = area.listingCount ?? 0;
                  return (
                    <li key={area.areaKey}>
                      <button
                        type="button"
                        onClick={() => handlePickArea(area.areaKey)}
                        className="flex items-center justify-between w-full p-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50 group"
                        data-testid={`search-result-${area.areaKey}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-copper-tint text-copper">
                            <MapPin className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground truncate group-hover:text-copper transition-colors">
                              {area.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {count} propert{count === 1 ? 'y' : 'ies'}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-copper">
                          Explore area
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : query.trim().length < 2 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              Type at least 2 characters to search schools…
            </div>
          ) : isLoadingSchools ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              Searching schools…
            </div>
          ) : schoolsData.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              No school matches “{query.trim()}”.
            </div>
          ) : (
            <ul className="divide-y divide-border/60" role="list">
              {schoolsData.map((school) => (
                <li key={school.id}>
                  <button
                    type="button"
                    onClick={() => handlePickSchool(school.id)}
                    className="flex items-center justify-between w-full p-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50 group"
                    data-testid={`search-result-school-${school.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300">
                        <GraduationCap className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate group-hover:text-purple-600 transition-colors">
                          {school.name}
                        </p>
                        {school.address && (
                          <p className="text-xs text-muted-foreground truncate">
                            {school.address}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
                      Search near this school
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
