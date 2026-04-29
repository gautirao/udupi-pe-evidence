import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PropertyFilters } from '@/hooks/usePropertyListings';

const STATUS_OPTIONS = [
  { key: 'newToMarket' as const, label: 'New to Market' },
  { key: 'backOnMarket' as const, label: 'Back on Market' },
  { key: 'reraRegistered' as const, label: 'RERA Registered' },
  { key: 'readyToMove' as const, label: 'Ready to Move' },
] as const;

interface ListingStatusFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
}

export function ListingStatusFilter({ filters, onFiltersChange }: ListingStatusFilterProps) {
  const handleToggle = (key: 'backOnMarket' | 'newToMarket' | 'reraRegistered' | 'readyToMove') => {
    onFiltersChange({ ...filters, [key]: filters[key] ? undefined : true });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Listing Status</Label>
      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map(({ key, label }) => {
          const active = !!filters[key];
          return (
            <Button
              key={key}
              variant={active ? 'default' : 'outline'}
              size="sm"
              className="h-8 px-3 text-sm"
              aria-pressed={active}
              onClick={() => handleToggle(key)}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
