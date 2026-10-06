/**
 * SchoolSummaryBand — moved verbatim from SchoolJourneyPanels.tsx (Issue #2661
 * commit 3, no logic/JSX changes). homesNoun/prettifySlug are private helpers
 * used only by this component; moved alongside it rather than shared.
 */
import { Fragment } from 'react';
import { ChevronRight, GraduationCap, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SchoolJourneyHero } from '../../SchoolJourneyHero';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

/** Buy/Rent-aware noun for the homes count — never the vague "listings". */
function homesNoun(intent: DiscoverIntent, n: number): string {
  if (intent === 'rent') return n === 1 ? 'rental available' : 'rentals available';
  return n === 1 ? 'home for sale' : 'homes for sale';
}

/** Title-case a kebab slug for display (e.g. "university-belt" → "University Belt"). */
function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface SchoolSummaryBandProps {
  school: SchoolResult;
  listings: DiscoverCityListingItem[];
  intent: DiscoverIntent;
  /** Breadcrumb: zone slug (groupId) — prettified; null if absent. */
  groupId?: string | null;
  /** Breadcrumb: area label (e.g. "Manipal"); null if absent. */
  areaLabel?: string | null;
  /** Called when the user clicks "Change school". */
  onChangeSchool: () => void;
  /**
   * Issue #2770 — bounded compaction used below the desktop reskin (mobile + 821-1365): same
   * navy surface, breadcrumb, title, change button and count (same testids, same DOM order) in
   * ~25% less height — tighter padding, "Change school" pinned top-right (44px target) so it no
   * longer squeezes the title column, address on one line, count stat inline. Default `false`
   * keeps the SchoolJourneyHero layout byte-identical for any other caller.
   */
  compact?: boolean;
}

export function SchoolSummaryBand({
  school,
  listings,
  intent,
  groupId,
  areaLabel,
  onChangeSchool,
  compact = false,
}: SchoolSummaryBandProps) {
  const boardDisplay = school.board ?? school.boardType ?? null;
  const count = listings.length;

  // Visual-parity polish (cycle 2) — dark-navy hero (mock parity), replacing the
  // tinted-card SummaryBandCard. School-first-local component; does not touch the
  // shared _shared/SummaryBandCard used by area-first/agri-first.
  const breadcrumb = [
    ...(groupId ? [{ key: 'zone', label: prettifySlug(groupId) }] : []),
    ...(areaLabel ? [{ key: 'area', label: areaLabel }] : []),
    { key: 'school', label: school.name, current: true },
  ];

  const boardBadge = boardDisplay ? (
    <span className="inline-flex items-center rounded-full bg-plum-tint px-2.5 py-0.5 text-[11px] font-semibold text-plum">
      {boardDisplay}
    </span>
  ) : undefined;

  if (compact) {
    return (
      // 24px below the band; the radius row that follows drops its "Search radius" label (see RadiusChips).
      <div className="mx-4 mb-6 mt-4">
        <div
          className="relative rounded-2xl border border-slate-800 bg-[#0F172A] p-4 text-white shadow-lg"
          data-testid="school-summary-band"
        >
          <nav aria-label="School breadcrumb" className="mb-1 flex min-h-11 items-center pr-32">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-400">
              {breadcrumb.map((crumb, i) => (
                <Fragment key={crumb.key}>
                  {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" aria-hidden="true" />}
                  <li
                    className={crumb.current ? 'text-white' : undefined}
                    aria-current={crumb.current ? 'page' : undefined}
                  >
                    {crumb.label}
                  </li>
                </Fragment>
              ))}
            </ol>
          </nav>
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))]">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--plum))]">
                  Selected school
                </p>
                {boardBadge}
              </div>
              <h3
                className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-base font-bold leading-snug tracking-tight text-white"
                data-testid="school-summary-name"
              >
                {school.name}
              </h3>
              {school.address && (
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-300">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span className="truncate">{school.address}</span>
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChangeSchool}
            data-testid="change-school-btn"
            className="absolute right-4 top-3 min-h-11 shrink-0 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            Change school
          </Button>
          <div className="mt-2 flex items-center border-t border-slate-700 pt-2">
            <div className="flex items-baseline gap-1.5" data-testid="school-summary-count">
              <span className="font-mono text-lg font-bold leading-none tabular-nums text-white">{count}</span>
              <span className="text-xs text-slate-400">{homesNoun(intent, count)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="m-4">
      <SchoolJourneyHero
        dataTestId="school-summary-band"
        breadcrumb={breadcrumb}
        icon={GraduationCap}
        eyebrowLabel="Selected school"
        badge={boardBadge}
        title={school.name}
        titleTestId="school-summary-name"
        description={
          school.address ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              {school.address}
            </span>
          ) : undefined
        }
        stats={[
          {
            key: 'homes',
            value: count,
            label: homesNoun(intent, count),
            testId: 'school-summary-count',
          },
        ]}
        onChangeAction={onChangeSchool}
        changeActionLabel="Change school"
        changeActionTestId="change-school-btn"
      />
    </div>
  );
}
