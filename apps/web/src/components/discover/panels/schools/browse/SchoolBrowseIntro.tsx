/**
 * SchoolBrowseIntro — moved verbatim from SchoolJourneyPanels.tsx (Issue #2661
 * commit 3, no logic/JSX changes).
 *
 * Issue #1770 — dark navy intro card for the school-first landing. Mirrors
 * AreaGroupsIntro (area-first) with plum identity colour.
 */
import { GraduationCap, X } from 'lucide-react';

export interface SchoolBrowseIntroProps {
  displayCity: string;
  activeScopeLabel: string | null;
  totalSchoolCount: number;
  onClearScope?: () => void;
}

export function SchoolBrowseIntro({ displayCity, activeScopeLabel, totalSchoolCount, onClearScope }: SchoolBrowseIntroProps) {
  const titleText = activeScopeLabel
    ? `School zones in ${activeScopeLabel}`
    : `School zones across ${displayCity}`;

  return (
    <div
      className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg text-white"
      data-testid="school-browse-intro"
    >
      {/* Breadcrumb / Eyebrow */}
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
        <span>Discover {displayCity}</span>
        <span className="text-slate-600">›</span>
        <span className="text-[hsl(var(--plum))] uppercase tracking-wider">Search near school</span>
      </div>

      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))]">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white" data-testid="school-browse-intro-title">
            {titleText}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            {activeScopeLabel
              ? `Pick a school zone within ${activeScopeLabel}, or search a school by name.`
              : 'Pick a school zone below, or search a school by name.'}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-700 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <GraduationCap className="h-3.5 w-3.5 text-[hsl(var(--plum))]" aria-hidden="true" />
          <span className="font-mono font-semibold text-white tabular-nums" data-testid="school-browse-intro-count">
            {totalSchoolCount > 0 ? totalSchoolCount : '–'}
          </span>
          <span>schools</span>
        </div>
        {activeScopeLabel && onClearScope && (
          <button
            type="button"
            onClick={onClearScope}
            className="inline-flex items-center gap-1 rounded-md bg-slate-700/60 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {activeScopeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
