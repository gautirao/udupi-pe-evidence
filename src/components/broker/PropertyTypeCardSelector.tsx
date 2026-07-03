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
  // M38-13A (#1626) — villa/residential_plot icons (design §1: house-style / plot-style cards).
  villa: Home,
  residential_plot: LandPlot,
  commercial: Store,
  commercial_building: Building,
  warehouse: Warehouse,
  commercial_land: LandPlot,
};

/** M38-13A (#1626) — the four residential subtypes shown by the residential-only variant. */
const RESIDENTIAL_TYPE_VALUES: ReadonlySet<PropertyType> = new Set(['apartment', 'house', 'villa', 'residential_plot']);

/** #1684 [M38-13B] — the four commercial subtypes shown by the commercial-only variant. */
const COMMERCIAL_TYPE_VALUES: ReadonlySet<PropertyType> = new Set(['commercial', 'commercial_building', 'warehouse', 'commercial_land']);

interface PropertyTypeCardSelectorProps {
  value: PropertyType | '';
  onChange: (value: PropertyType) => void;
  id?: string;
  /**
   * M38-13A (#1626) — when true, renders ONLY the 4 residential subtypes
   * (design-spec.md §section_order 1). Default (false/omitted) is UNCHANGED —
   * every other caller (commercial/agri generic flow, EditListing) keeps
   * seeing all 10 property types exactly as before.
   */
  residentialOnly?: boolean;
  /**
   * #1684 [M38-13B] — when true, renders ONLY the 4 commercial subtypes
   * (mirrors residentialOnly). Mutually exclusive with residentialOnly.
   */
  commercialOnly?: boolean;
}

/**
 * Figma-style selectable card grid for the property type.
 * Renders every option in PROPERTY_TYPES as an icon-over-label card (no
 * property type is dropped) unless `residentialOnly` is set. Selecting a card
 * updates the same form value the dropdown used and emits the unchanged
 * payload value — purely presentational.
 *
 * Accessibility: a radiogroup of role="radio" buttons (aria-checked).
 * Responsive: 2 columns on mobile, 3 on small, 4 on large — extra types wrap.
 */
export function PropertyTypeCardSelector({ value, onChange, id, residentialOnly = false, commercialOnly = false }: PropertyTypeCardSelectorProps) {
  const types = residentialOnly
    ? PROPERTY_TYPES.filter((pt) => RESIDENTIAL_TYPE_VALUES.has(pt.value))
    : commercialOnly
      ? PROPERTY_TYPES.filter((pt) => COMMERCIAL_TYPE_VALUES.has(pt.value))
      : PROPERTY_TYPES;

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Property type"
      className={residentialOnly || commercialOnly ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-4' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'}
    >
      {types.map((pt) => {
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
