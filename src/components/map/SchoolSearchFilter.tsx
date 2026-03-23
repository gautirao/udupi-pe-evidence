import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useSchoolSearch, SchoolResult } from '@/hooks/useSchoolSearch';
import { GraduationCap, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const BOARD_TYPES = ['CBSE', 'ICSE', 'State', 'IGCSE', 'IB'] as const;

const RADIUS_OPTIONS = [
  { value: 1, label: '1 km' },
  { value: 2, label: '2 km' },
  { value: 5, label: '5 km' },
] as const;

interface SchoolSearchFilterProps {
  selectedSchool: SchoolResult | null;
  onSchoolSelect: (school: SchoolResult | null) => void;
  radiusKm: number;
  onRadiusChange: (radius: number) => void;
  boardFilter: string[];
  onBoardFilterChange: (boards: string[]) => void;
}

export function SchoolSearchFilter({
  selectedSchool,
  onSchoolSelect,
  radiusKm,
  onRadiusChange,
  boardFilter,
  onBoardFilterChange,
}: SchoolSearchFilterProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isLoading } = useSchoolSearch(debouncedQuery);

  // Filter results by board type if board filter is active
  const filteredResults = boardFilter.length > 0
    ? results.filter((s) => boardFilter.includes(s.boardType))
    : results;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (school: SchoolResult) => {
    onSchoolSelect(school);
    setQuery('');
    setDebouncedQuery('');
    setIsDropdownOpen(false);
  };

  const handleClear = () => {
    onSchoolSelect(null);
    setQuery('');
    setDebouncedQuery('');
    onBoardFilterChange([]);
  };

  const handleBoardToggle = (board: string) => {
    const next = boardFilter.includes(board)
      ? boardFilter.filter((b) => b !== board)
      : [...boardFilter, board];
    onBoardFilterChange(next);
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setIsDropdownOpen(value.trim().length >= 2);
  };

  const handleInputFocus = () => {
    if (query.trim().length >= 2) {
      setIsDropdownOpen(true);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-1.5">
        <GraduationCap className="h-3.5 w-3.5" />
        Search Near School
      </Label>

      {/* Selected school display */}
      {selectedSchool ? (
        <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-md">
          <GraduationCap className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedSchool.name}</p>
            <p className="text-xs text-muted-foreground">{selectedSchool.boardType}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleClear}
            aria-label="Clear school selection"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        /* Search input with autocomplete dropdown */
        <div className="relative" ref={dropdownRef}>
          <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            placeholder="Type a school name..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleInputFocus}
            className="pl-8 h-9 text-sm"
            aria-label="Search for a school"
            role="combobox"
            aria-expanded={isDropdownOpen}
            aria-autocomplete="list"
          />
          {isLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}

          {/* Autocomplete dropdown */}
          {isDropdownOpen && debouncedQuery.trim().length >= 2 && (
            <div
              className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
              role="listbox"
            >
              {filteredResults.length === 0 && !isLoading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No schools found
                </div>
              )}
              {filteredResults.map((school) => (
                <button
                  key={school.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-accent cursor-pointer flex items-start gap-2"
                  onClick={() => handleSelect(school)}
                  role="option"
                  aria-selected={false}
                >
                  <GraduationCap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{school.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {school.boardType}
                      {school.address ? ` \u00b7 ${school.address}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Radius selector — shown when a school is selected */}
      {selectedSchool && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Search radius</Label>
          <div className="flex gap-1.5">
            {RADIUS_OPTIONS.map(({ value, label }) => {
              const active = radiusKm === value;
              return (
                <Button
                  key={value}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  aria-pressed={active}
                  onClick={() => onRadiusChange(value)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Board type filter chips */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Board type</Label>
        <div className="flex gap-1.5 flex-wrap">
          {BOARD_TYPES.map((board) => {
            const active = boardFilter.includes(board);
            return (
              <Badge
                key={board}
                variant={active ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer text-xs',
                  active && 'bg-primary text-primary-foreground',
                )}
                onClick={() => handleBoardToggle(board)}
              >
                {board}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
