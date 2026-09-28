import { X } from 'lucide-react';

export interface SelectedFilterChip {
  key: string;
  label: string;
  testId: string;
  onRemove: () => void;
}

export interface SelectedFilterChipsProps {
  chips: readonly SelectedFilterChip[];
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx: the
 * Issue #2555 item 2 individually-removable selected-filter chip row
 * ("Use selected-filter chips that can be removed individually").
 *
 * Presentational only — WHICH chips exist and what they're labeled is
 * substantial derived business logic (the #2572 commercial-family-token
 * suppression, the #2459 D1 area-chip disclosure text, the capability
 * gates on subtype/bedrooms/readyToMove chips, …) that stays in
 * PropertyFilterGroups' own render function rather than moving here: this
 * component's only job is rendering an already-computed chip list, exactly
 * as it did inline. See PropertyFilterGroups.tsx's own comments at the
 * chip-building call site for that reasoning, which this extraction does
 * not repeat or re-derive.
 *
 * Nothing selected renders nothing (not an empty bordered strip) — the
 * caller is expected to skip rendering this component entirely when
 * `chips` is empty, matching the source's own guard.
 */
export function SelectedFilterChips({ chips }: SelectedFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3"
      role="group"
      aria-label="Selected filters"
      data-testid="selected-filter-chips"
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold-tint px-2.5 py-1 text-xs font-medium text-foreground"
          data-testid={chip.testId}
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.label} filter`}
            data-testid={`${chip.testId}-dismiss`}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
