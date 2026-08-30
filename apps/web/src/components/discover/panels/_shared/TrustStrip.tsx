import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrustStripProps {
  className?: string;
}

/**
 * Shared verification trust strip, extracted from GuidedEntryPanel /
 * AreaGroupsLandingPanel (byte-identical markup + copy in both call sites).
 * Presentational only — no props beyond an optional className override so
 * callers can adjust spacing (e.g. drop the top border when it isn't the
 * final section on the page).
 */
export function TrustStrip({ className }: TrustStripProps) {
  return (
    <div className={cn('flex items-center gap-3 border-t border-border pt-5', className)}>
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-[hsl(var(--evergreen-tint))]">
        <ShieldCheck className="h-[19px] w-[19px] text-[hsl(var(--evergreen))]" aria-hidden="true" />
      </span>
      <p className="text-[13px] leading-snug text-muted-foreground">
        <strong className="text-foreground">Every listing is verified.</strong> Documents
        checked, RERA registered, broker confirmed — before it reaches you.
      </p>
    </div>
  );
}
