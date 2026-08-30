import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PropertyFilters } from '@/hooks/usePropertyListings';

const BHK_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4+', value: 4 },
] as const;

interface BedroomFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
}

export function BedroomFilter({ filters, onFiltersChange }: BedroomFilterProps) {
  const handleToggle = (value: number) => {
    const current = filters.bedrooms || [];
    const next = current.includes(value) ? current.filter((b) => b !== value) : [...current, value];
    onFiltersChange({ ...filters, bedrooms: next.length > 0 ? next : undefined });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Bedrooms (BHK)</Label>
      <div className="flex gap-2 flex-wrap">
        {BHK_OPTIONS.map(({ label, value }) => {
          const active = filters.bedrooms?.includes(value) || false;
          return (
            <Button
              key={value}
              variant={active ? 'default' : 'outline'}
              size="sm"
              className="h-8 px-3 text-sm"
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
