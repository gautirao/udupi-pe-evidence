import { Check } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential single-page create flow (design-spec.md §right_column).
// D-FE4: PURE PRESENTATION derived from current form React state — no backend call,
// no new data source. The checklist below is a client-side completeness heuristic,
// NOT a backend-computed "listing quality"/trust score (see BusinessLogicBoundary).
// ---------------------------------------------------------------------------

export interface ListingStrengthChecklist {
  hasType: boolean;
  hasPurpose: boolean;
  hasLocality: boolean;
  hasArea: boolean;
  hasPrice: boolean;
  hasTitle: boolean;
  hasConfigDetails: boolean;
  hasPhotos: boolean;
  isPinned: boolean;
  hasDescription: boolean;
}

interface ChecklistRow {
  key: keyof ListingStrengthChecklist;
  label: string;
}

const CHECKLIST_ROWS: readonly ChecklistRow[] = [
  { key: 'hasType', label: 'Property type & purpose' },
  { key: 'hasLocality', label: 'Locality & title' },
  { key: 'hasArea', label: 'Area & configuration' },
  { key: 'hasPrice', label: 'Price / rent' },
  { key: 'hasPhotos', label: 'Photos added' },
  { key: 'isPinned', label: 'Location pinned' },
  { key: 'hasDescription', label: 'Description confirmed' },
];

function strengthLabel(percent: number): string {
  if (percent >= 80) return 'Strong';
  if (percent >= 50) return 'Good';
  if (percent >= 25) return 'Fair';
  return 'Just started';
}

/** Computes the 0-100 completeness percent from the checklist (equal-weighted). */
export function computeListingStrength(checklist: ListingStrengthChecklist): number {
  const values = Object.values(checklist);
  const done = values.filter(Boolean).length;
  return Math.round((done / values.length) * 100);
}

interface ListingStrengthMeterProps {
  checklist: ListingStrengthChecklist;
}

export function ListingStrengthMeter({ checklist }: ListingStrengthMeterProps) {
  const percent = computeListingStrength(checklist);
  const label = strengthLabel(percent);

  return (
    <div className="space-y-3" data-testid="listing-strength-meter">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">Listing strength</span>
        <span className="text-xs font-mono text-muted-foreground">{label} · {percent}%</span>
      </div>
      <Progress value={percent} aria-label="Listing strength" />
      <ul className="space-y-1.5">
        {CHECKLIST_ROWS.map((row) => {
          const done = checklist[row.key];
          return (
            <li key={row.key} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  done ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-transparent',
                )}
                aria-hidden="true"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{row.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
