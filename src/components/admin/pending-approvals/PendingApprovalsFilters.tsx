import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { humanizeEnumValue } from '@/lib/formatters';
import {
  AGE_BUCKETS,
  AGE_BUCKET_LABELS,
  REVIEW_FLAGS,
  REVIEW_FLAG_LABELS,
  type AgeBucket,
  type PendingApprovalsFilterState,
  type ReviewFlag,
} from './pendingApprovalsHelpers';

interface PendingApprovalsFiltersProps {
  filters: PendingApprovalsFilterState;
  onChange: (filters: PendingApprovalsFilterState) => void;
  propertyTypeOptions: string[];
  localityOptions: string[];
  resultCount: number;
}

export function PendingApprovalsFilters({
  filters,
  onChange,
  propertyTypeOptions,
  localityOptions,
  resultCount,
}: PendingApprovalsFiltersProps) {
  const activeFilterCount =
    filters.propertyTypes.length +
    filters.localities.length +
    filters.flags.length +
    (filters.ageBucket !== 'any' ? 1 : 0);

  const toggleFromList = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search title, listing ID, or locality"
            placeholder="Search title, listing ID, or locality"
            className="bg-card pl-8"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-card">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Property type</p>
                <div className="flex flex-wrap gap-1.5">
                  {propertyTypeOptions.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={filters.propertyTypes.includes(type)}
                      onClick={() =>
                        onChange({ ...filters, propertyTypes: toggleFromList(filters.propertyTypes, type) })
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        filters.propertyTypes.includes(type)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {humanizeEnumValue(type)}
                    </button>
                  ))}
                  {propertyTypeOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No property types in queue</p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Locality</p>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {localityOptions.map((locality) => (
                    <button
                      key={locality}
                      type="button"
                      aria-pressed={filters.localities.includes(locality)}
                      onClick={() =>
                        onChange({ ...filters, localities: toggleFromList(filters.localities, locality) })
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        filters.localities.includes(locality)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {locality}
                    </button>
                  ))}
                  {localityOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No localities in queue</p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Submission age</p>
                <div className="flex flex-wrap gap-1.5">
                  {AGE_BUCKETS.map((bucket: AgeBucket) => (
                    <button
                      key={bucket}
                      type="button"
                      aria-pressed={filters.ageBucket === bucket}
                      onClick={() => onChange({ ...filters, ageBucket: bucket })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        filters.ageBucket === bucket
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {AGE_BUCKET_LABELS[bucket]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Review flags</p>
                <div className="space-y-2">
                  {REVIEW_FLAGS.map((flag: ReviewFlag) => (
                    <div key={flag} className="flex items-center gap-2">
                      <Checkbox
                        id={`flag-${flag}`}
                        checked={filters.flags.includes(flag)}
                        onCheckedChange={() => onChange({ ...filters, flags: toggleFromList(filters.flags, flag) })}
                      />
                      <Label htmlFor={`flag-${flag}`} className="text-sm font-normal">
                        {REVIEW_FLAG_LABELS[flag]}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 px-0 text-muted-foreground"
                  onClick={() =>
                    onChange({ ...filters, propertyTypes: [], localities: [], ageBucket: 'any', flags: [] })
                  }
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground" data-testid="pending-results-count">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </span>
        <Select value={filters.sort} onValueChange={(value) => onChange({ ...filters, sort: value as PendingApprovalsFilterState['sort'] })}>
          <SelectTrigger className="w-[140px] bg-card" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
