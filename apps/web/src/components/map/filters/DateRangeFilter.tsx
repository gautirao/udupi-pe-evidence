import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

interface DateRangeFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
}

export function DateRangeFilter({ filters, onFiltersChange }: DateRangeFilterProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Date Posted</Label>
      <div className="grid grid-cols-2 gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'h-9 text-xs justify-start text-left font-normal',
                !filters.dateFrom && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {filters.dateFrom ? format(filters.dateFrom, 'MMM d') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filters.dateFrom}
              onSelect={(date) => onFiltersChange({ ...filters, dateFrom: date })}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'h-9 text-xs justify-start text-left font-normal',
                !filters.dateTo && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {filters.dateTo ? format(filters.dateTo, 'MMM d') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filters.dateTo}
              onSelect={(date) => onFiltersChange({ ...filters, dateTo: date })}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
