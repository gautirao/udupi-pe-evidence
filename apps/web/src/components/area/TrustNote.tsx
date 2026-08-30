import { Shield } from 'lucide-react';

/**
 * Trust / confidence note (AC6) — green-tinted panel, shield icon.
 * Static buyer-safe copy — no per-area data needed.
 */
export function TrustNote() {
  return (
    <div
      className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-4"
      role="note"
    >
      <div className="h-9 w-9 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0">
        <Shield className="h-5 w-5 text-emerald-700" />
      </div>
      <div>
        <p className="text-sm font-semibold text-emerald-900 mb-1">Why we show this</p>
        <p className="text-sm text-emerald-800 leading-relaxed">
          We only show a figure when there&apos;s enough verified listing or search activity to be
          reliable. When there isn&apos;t, we show &ldquo;Not enough data yet&rdquo; instead of
          guessing.
        </p>
      </div>
    </div>
  );
}
