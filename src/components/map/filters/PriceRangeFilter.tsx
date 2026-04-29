import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { PropertyFilters, usePriceRange } from '@/hooks/usePropertyListings';
import { formatPrice } from '@/lib/formatters';

interface PriceRangeFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
}

export function PriceRangeFilter({ filters, onFiltersChange }: PriceRangeFilterProps) {
  const { data: priceRange } = usePriceRange();

  const handleChange = (values: number[]) => {
    onFiltersChange({
      ...filters,
      priceMin: values[0] > (priceRange?.min || 0) ? values[0] : undefined,
      priceMax: values[1] < (priceRange?.max || 10000000) ? values[1] : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Price Range</Label>
      {priceRange && (
        <>
          <Slider
            min={priceRange.min}
            max={priceRange.max}
            step={Math.max(1, Math.floor((priceRange.max - priceRange.min) / 100))}
            value={[filters.priceMin ?? priceRange.min, filters.priceMax ?? priceRange.max]}
            onValueChange={handleChange}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatPrice(filters.priceMin ?? priceRange.min)}</span>
            <span>{formatPrice(filters.priceMax ?? priceRange.max)}</span>
          </div>
        </>
      )}
    </div>
  );
}
