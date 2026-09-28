import { Plus } from 'lucide-react';

export interface ViewportSchoolCtaProps {
  onAddSchool: () => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx (Issue
 * #2015): the VIEWPORT-scope "Add a school in this area" CTA, kept at its
 * MERGE-BASE presentation — own bordered/padded wrapper.
 *
 * The caller's eligibility gate (`!multiAreaKeys && isViewportScope &&
 * onAddSchool`) stays at the call site, unchanged — this component always
 * renders when mounted, matching every other section's "gate lives at the
 * call site" convention in this extraction.
 */
export function ViewportSchoolCta({ onAddSchool }: ViewportSchoolCtaProps) {
  return (
    <div className="border-b border-border px-4 py-3">
      <button
        type="button"
        onClick={onAddSchool}
        data-testid="add-school-cta"
        className="flex w-full items-center gap-3 rounded-xl border border-plum/20 bg-plum-tint p-3 text-left shadow-sm transition-colors hover:border-plum/50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-plum text-plum-foreground">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex-1 text-sm font-semibold text-foreground">Add a school in this area</span>
        <span className="shrink-0 text-xs text-muted-foreground">Optional</span>
      </button>
    </div>
  );
}
