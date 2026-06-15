import { cn } from '@/lib/utils';

interface ListingPurposeToggleProps {
  value: 'sale' | 'rent';
  onChange: (value: 'sale' | 'rent') => void;
  className?: string;
}

const OPTIONS = [
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
] as const;

/**
 * Polished segmented control for the Sale / Rent listing purpose.
 * Presentational only — preserves the existing two-option behaviour
 * (each option is a real <button> labelled "For Sale" / "For Rent").
 */
export function ListingPurposeToggle({ value, onChange, className }: ListingPurposeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Listing purpose"
      className={cn('inline-flex rounded-lg bg-muted p-1', className)}
    >
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md px-5 py-1.5 text-sm font-medium transition-colors',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
