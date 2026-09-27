/**
 * SchoolSummaryBand — moved verbatim from SchoolJourneyPanels.tsx (Issue #2661
 * commit 3, no logic/JSX changes). homesNoun/prettifySlug are private helpers
 * used only by this component; moved alongside it rather than shared.
 */
import { GraduationCap, MapPin } from 'lucide-react';
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
}

export function SchoolSummaryBand({
  school,
  listings,
  intent,
  groupId,
  areaLabel,
  onChangeSchool,
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

  return (
    <div className="m-4">
      <SchoolJourneyHero
        dataTestId="school-summary-band"
        breadcrumb={breadcrumb}
        icon={GraduationCap}
        eyebrowLabel="Selected school"
        badge={
          boardDisplay ? (
            <span className="inline-flex items-center rounded-full bg-plum-tint px-2.5 py-0.5 text-[11px] font-semibold text-plum">
              {boardDisplay}
            </span>
          ) : undefined
        }
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
