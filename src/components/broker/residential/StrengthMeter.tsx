import { Check, TriangleAlert } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ListingStrengthResult } from '@/lib/listingStrength';

// ---------------------------------------------------------------------------
// Issue #1718 — residential single-page create parity (design-spec.md
// "Listing strength" / "Before you submit" panels). Renders the REAL submit
// gates computed by src/lib/listingStrength.ts — this is a completeness
// heuristic mirroring the backend, not a fabricated trust/verification score.
// ---------------------------------------------------------------------------

function strengthLabel(percent: number): string {
  if (percent >= 80) return 'Strong';
  if (percent >= 50) return 'Good';
  if (percent >= 25) return 'Fair';
  return 'Just started';
}

interface StrengthMeterProps {
  result: ListingStrengthResult;
  /** "sidebar" = compact checklist; "review" = "Before you submit" style with only unmet items. */
  variant?: 'sidebar' | 'review';
}

export function StrengthMeter({ result, variant = 'sidebar' }: StrengthMeterProps) {
  const label = strengthLabel(result.percent);

  if (variant === 'review') {
    return (
      <div className="rounded-2xl border bg-card p-4 shadow-sm" data-testid="strength-meter-review">
        <p className="mb-3 text-[13px] font-semibold text-foreground">Before you submit</p>
        {result.isSubmittable ? (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            Everything required is filled in.
          </div>
        ) : (
          <ul className="space-y-2">
            {result.missingItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="strength-meter-sidebar">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">Listing strength</span>
        <span className="text-xs font-mono text-muted-foreground">{label} · {result.percent}%</span>
      </div>
      <Progress value={result.percent} aria-label="Listing strength" />
      <ul className="space-y-1.5">
        {result.gates.map((gate) => (
          <li key={gate.key} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                gate.met ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-transparent',
              )}
              aria-hidden="true"
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className={gate.met ? 'text-foreground' : 'text-muted-foreground'}>{gate.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
