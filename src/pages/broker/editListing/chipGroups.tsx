import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// ---------------------------------------------------------------------------
// M38-13A (#1626) — chip / segmented control affordances (design-spec.md §1).
// Built entirely from the EXISTING shadcn ToggleGroup primitive (Radix
// `type="single"` / `type="multiple"`) — no new dependency, no new form
// framework. Wire values are unchanged: chip `value`s ARE the same strings
// already stored in state / sent in the PUT payload (e.g. bedrooms '5' for
// the "5+" chip) — only the DISPLAY LABEL differs from the raw value.
// ---------------------------------------------------------------------------

export interface ChipOption {
  readonly value: string;
  readonly label: string;
}

/** BHK — 1/2/3/4/5+ (design §1). Value IS the numeric bedrooms string sent on save. */
export const BHK_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
];

/** Bathrooms — 1/2/3/4+ (design §1). */
export const BATHROOM_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4+' },
];

/** Balconies — 0/1/2/3+ (design §1). */
export const BALCONY_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

/** 2w/4w parking — 0/1/2/3+ (design §1). Shared vocab for both parking chip groups. */
export const PARKING_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3+' },
];

/**
 * House/villa "Number of floors" — Ground/G+1/G+2/G+3/G+4+ (design §1). Reuses the
 * `totalFloors` column/state (no separate backend column — see HOUSE_VILLA_ONLY_FIELDS
 * comment in listingFieldConfig.ts); the chip is a house/villa-only display convention,
 * NOT used for apartment/commercial_building's plain "Total floors" count.
 */
export const FLOORS_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: '0', label: 'Ground' },
  { value: '1', label: 'G+1' },
  { value: '2', label: 'G+2' },
  { value: '3', label: 'G+3' },
  { value: '4', label: 'G+4+' },
];

interface SingleChipGroupProps {
  id: string;
  label: string;
  options: readonly ChipOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** 'chip' = individual bordered pills (BHK/bathrooms/etc); 'segmented' = single pill-track (furnishing/status/maintenance). */
  variant?: 'chip' | 'segmented';
}

/**
 * Single-select chip/segmented control — shadcn ToggleGroup type="single".
 * The visible <Label> is associated via aria-labelledby (not htmlFor) because the
 * ToggleGroup root renders a plain div, which is not a labelable form control —
 * `<Label htmlFor>` pointing at it is a no-op for assistive tech (a11y fix).
 */
export function SingleChipGroup({ id, label, options, value, onValueChange, variant = 'chip' }: SingleChipGroupProps) {
  const labelId = `${id}-label`;
  return (
    <div className="space-y-2" data-testid={`chip-group-${id}`}>
      <Label id={labelId}>{label}</Label>
      <ToggleGroup
        id={id}
        type="single"
        value={value}
        aria-labelledby={labelId}
        // Radix collapses to '' when the pressed item is clicked again — ignore that
        // so a required single-select control can't be cleared to "nothing selected".
        onValueChange={(v) => { if (v) onValueChange(v); }}
        className={variant === 'segmented' ? 'inline-flex w-fit rounded-lg bg-muted p-1' : 'flex-wrap justify-start gap-2'}
      >
        {options.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            aria-label={opt.label}
            className={
              variant === 'segmented'
                ? 'rounded-md px-4 py-1.5 text-sm data-[state=on]:bg-card data-[state=on]:shadow-sm'
                : 'rounded-full border px-4 py-1.5 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10'
            }
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

interface MultiChipGroupProps {
  label: string;
  options: readonly ChipOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  testId?: string;
}

/**
 * Multi-select chip control — shadcn ToggleGroup type="multiple". Emits the FINAL desired set.
 * Same aria-labelledby association as SingleChipGroup — the ToggleGroup root div is not a
 * labelable control, so a plain <Label> with no `htmlFor`/`id` pairing is not enough (a11y fix).
 */
export function MultiChipGroup({ label, options, value, onValueChange, testId }: MultiChipGroupProps) {
  const generatedId = useId();
  const labelId = `${testId ?? generatedId}-label`;
  return (
    <div className="space-y-2" data-testid={testId}>
      <Label id={labelId}>{label}</Label>
      <ToggleGroup type="multiple" value={value} onValueChange={onValueChange} aria-labelledby={labelId} className="flex-wrap justify-start gap-2">
        {options.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            aria-label={opt.label}
            className="rounded-full border px-4 py-1.5 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
