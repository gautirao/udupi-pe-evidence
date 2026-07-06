/**
 * SchoolJourneyHero — school-first-local dark-navy hero card (visual-parity polish,
 * cycle 2). Mirrors the mock's navy hero used for the zone-selected, area-selected
 * and school-selected states, following the same visual language as the existing
 * `SchoolBrowseIntro` landing hero in SchoolJourneyPanels.tsx (bg-[#0F172A], plum
 * accent, serif title).
 *
 * Deliberately local to the school-first journey (not a change to the shared
 * `panels/_shared/SummaryBandCard`, which other journeys — area-first, agri-first —
 * also render): this file lives under `panels/` and is only ever imported by
 * school-first panels, so it cannot regress other journeys.
 */
import React from 'react';
import type { ComponentType, SVGProps } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SchoolJourneyHeroCrumb {
  key: string;
  label: string;
  /** The final/current crumb renders bold + white; earlier crumbs render muted slate. */
  current?: boolean;
}

export interface SchoolJourneyHeroStat {
  key: string;
  value: number | string;
  label: React.ReactNode;
  testId?: string;
}

export interface SchoolJourneyHeroProps {
  /** Breadcrumb segments, e.g. ["Discover Bangalore", "University Belt"]. */
  breadcrumb: SchoolJourneyHeroCrumb[];
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Small-caps eyebrow label, e.g. "SCHOOL ZONE" / "SCHOOLS IN AREA" / "SELECTED SCHOOL". */
  eyebrowLabel: string;
  /** Serif display title. */
  title: React.ReactNode;
  titleTestId?: string;
  /** Optional helper/description line under the title. */
  description?: React.ReactNode;
  /** Optional badge rendered next to the eyebrow (e.g. the school's board chip). */
  badge?: React.ReactNode;
  /** Stat pairs rendered below the divider (e.g. schools count, homes count). */
  stats: SchoolJourneyHeroStat[];
  /** Optional right-side "Change school" outline button (school-selected state only). */
  onChangeAction?: () => void;
  changeActionLabel?: string;
  changeActionTestId?: string;
  dataTestId?: string;
}

export function SchoolJourneyHero({
  breadcrumb,
  icon: Icon,
  eyebrowLabel,
  title,
  titleTestId,
  description,
  badge,
  stats,
  onChangeAction,
  changeActionLabel = 'Change school',
  changeActionTestId,
  dataTestId,
}: SchoolJourneyHeroProps) {
  return (
    <div
      className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg text-white"
      data-testid={dataTestId}
    >
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <nav aria-label="School breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-400">
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={crumb.key}>
                {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" aria-hidden="true" />}
                <li
                  className={crumb.current ? 'text-white' : undefined}
                  aria-current={crumb.current ? 'page' : undefined}
                >
                  {crumb.label}
                </li>
              </React.Fragment>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5 min-w-0">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--plum))]">
                {eyebrowLabel}
              </p>
              {badge}
            </div>
            <h3
              className="mt-0.5 font-['Fraunces',_ui-serif,_Georgia,_serif] text-lg sm:text-xl font-bold tracking-tight text-white"
              data-testid={titleTestId ?? (dataTestId ? `${dataTestId}-title` : undefined)}
            >
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{description}</p>
            )}
          </div>
        </div>

        {onChangeAction && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChangeAction}
            data-testid={changeActionTestId}
            className="shrink-0 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            {changeActionLabel}
          </Button>
        )}
      </div>

      {/* Stats row */}
      {stats.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-slate-700 pt-3">
          {stats.map((stat) => (
            <div key={stat.key} className="flex flex-col" data-testid={stat.testId}>
              <span className="font-mono text-lg font-bold leading-none tabular-nums text-white">
                {stat.value}
              </span>
              <span className="mt-1 text-xs text-slate-400">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
