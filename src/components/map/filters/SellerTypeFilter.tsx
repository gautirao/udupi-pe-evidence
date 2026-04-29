import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PropertyFilters } from '@/hooks/usePropertyListings';

const SELLER_OPTIONS = [
  { label: 'Owner', value: 'owner' },
  { label: 'Broker', value: 'broker' },
] as const;

interface SellerTypeFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
}

export function SellerTypeFilter({ filters, onFiltersChange }: SellerTypeFilterProps) {
  const handleToggle = (value: string) => {
    const current = filters.sellerTypes || [];
    // "Broker" toggle controls both 'broker' and 'builder' seller types
    const valuesToToggle = value === 'broker' ? ['broker', 'builder'] : [value];
    const isActive = valuesToToggle.some((v) => current.includes(v));
    const next = isActive
      ? current.filter((s) => !valuesToToggle.includes(s))
      : [...current, ...valuesToToggle];
    onFiltersChange({ ...filters, sellerTypes: next.length > 0 ? next : undefined });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Listed By</Label>
      <div className="flex gap-2 flex-wrap">
        {SELLER_OPTIONS.map(({ label, value }) => {
          const active =
            value === 'broker'
              ? filters.sellerTypes?.includes('broker') ||
                filters.sellerTypes?.includes('dealer') ||
                false
              : filters.sellerTypes?.includes(value) || false;
          return (
            <Button
              key={value}
              variant={active ? 'default' : 'outline'}
              size="sm"
              className="h-8 px-3 text-sm"
              aria-pressed={active}
              onClick={() => handleToggle(value)}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
