import { ShieldCheck } from 'lucide-react';

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx (Issue
 * #1606, mock parity): the verification-reassurance footer. Takes no
 * props — its copy is static and unconditional.
 */
export function TrustStrip() {
  return (
    <div
      className="mt-auto flex items-start gap-2.5 border-t border-border bg-evergreen-tint/40 px-4 py-3.5"
      data-testid="area-trust-strip"
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Every listing is verified.</span>{' '}
        Documents checked, RERA registered, broker confirmed — before it reaches you.
      </p>
    </div>
  );
}
