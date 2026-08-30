import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential single-page create flow (design-spec.md).
// Shared chip/segmented-control helpers, extracted so the new residential
// composition (ResidentialListingForm.tsx) doesn't duplicate the near-identical
// SingleChipGroup/MultiChipGroup already inlined in NewListing.tsx/EditListing.tsx.
// Those two pages keep their own local copies unchanged (out of scope per the
// architect plan — EditListing/NewListing generic bodies are untouched).
// ---------------------------------------------------------------------------

export interface ChipOption {
  readonly value: string;
  readonly label: string;
}

interface SingleChipGroupProps {
  id: string;
  label: string;
  options: readonly ChipOption[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: 'chip' | 'segmented';
}

/** Single-select chip/segmented control — shadcn ToggleGroup type="single". */
export function SingleChipGroup({ id, label, options, value, onValueChange, variant = 'chip' }: SingleChipGroupProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>
      <ToggleGroup
        id={id}
        type="single"
        value={value}
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

/** Multi-select chip control — shadcn ToggleGroup type="multiple". Emits the FINAL desired set. */
export function MultiChipGroup({ label, options, value, onValueChange, testId }: MultiChipGroupProps) {
  const generatedId = useId();
  const labelId = `${testId ?? generatedId}-label`;
  return (
    <div className="space-y-2" data-testid={testId}>
      <Label id={labelId} className="text-[13px] font-semibold">{label}</Label>
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

/** Tri-state boolean → Select string ('' = not specified, distinct from explicit false). */
export function boolToTriState(value: boolean | null | undefined): string {
  return value === true ? 'true' : value === false ? 'false' : '';
}

/** Inverse of boolToTriState — '' → undefined (omit from payload). */
export function triStateToBool(value: string): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}
