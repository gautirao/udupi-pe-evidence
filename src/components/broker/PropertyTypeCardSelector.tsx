import type { LucideIcon } from 'lucide-react';
import { Building, Building2, Home, LandPlot, Map, Sprout, Store, Warehouse } from 'lucide-react';
import { PROPERTY_TYPES } from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import { cn } from '@/lib/utils';

// Icon per property type. Uses existing lucide-react icons (no new deps).
const PROPERTY_TYPE_ICONS: Record<PropertyType, LucideIcon> = {
  land: Map,
  agricultural_land: Sprout,
  apartment: Building2,
  house: Home,
  commercial: Store,
  commercial_building: Building,
  warehouse: Warehouse,
  commercial_land: LandPlot,
};

interface PropertyTypeCardSelectorProps {
  value: PropertyType | '';
  onChange: (value: PropertyType) => void;
  id?: string;
}

/**
 * Figma-style selectable card grid for the property type.
 * Renders every option in PROPERTY_TYPES as an icon-over-label card (no
 * property type is dropped). Selecting a card updates the same form value the
 * dropdown used and emits the unchanged payload value — purely presentational.
 *
 * Accessibility: a radiogroup of role="radio" buttons (aria-checked).
 * Responsive: 2 columns on mobile, 3 on small, 4 on large — extra types wrap.
 */
export function PropertyTypeCardSelector({ value, onChange, id }: PropertyTypeCardSelectorProps) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Property type"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {PROPERTY_TYPES.map((pt) => {
        const Icon = PROPERTY_TYPE_ICONS[pt.value];
        const selected = value === pt.value;
        return (
          <button
            key={pt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(pt.value)}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-center transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'border-primary bg-card text-foreground shadow-sm ring-1 ring-primary'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            <Icon
              className={cn('h-5 w-5', selected ? 'text-foreground' : 'text-muted-foreground')}
              aria-hidden="true"
            />
            <span className="text-sm font-medium leading-tight">{pt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
