import type { ComponentType, ReactNode, SVGProps } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SummaryBandAccent = 'copper' | 'plum' | 'evergreen';

interface SummaryBandStat {
  /** React key — also used to derive nothing else; pass `testId` separately. */
  key: string;
  value: number | string;
  label: ReactNode;
  /** Preserves a pre-existing data-testid on the value element (e.g. "summary-school-count"). */
  testId?: string;
}

interface SummaryBandCardProps {
  /** Journey accent — copper (area-first), plum (school-first), evergreen (agri-first). */
  accent: SummaryBandAccent;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Small uppercase label above the title (e.g. "Selected school"). */
  eyebrow?: ReactNode;
  /** Fully caller-built badge/pill rendered next to the eyebrow (e.g. board type, "Selected area"). */
  badge?: ReactNode;
  /** Fully caller-built breadcrumb (e.g. a <nav><ol>...</ol></nav>), rendered above the identity row. */
  breadcrumb?: ReactNode;
  title: ReactNode;
  /** Preserves a pre-existing data-testid on the title element (e.g. "school-summary-name"). */
  titleTestId?: string;
  description?: ReactNode;
  stats: SummaryBandStat[];
  /** "Change school" / "Change corridor" affordance, rendered above the breadcrumb. */
  onChange?: () => void;
  changeLabel?: string;
  /** Accessible name override when the visible label alone isn't descriptive enough
   * (e.g. visible "Change corridor" but accessible name "Clear selected region"). */
  changeAriaLabel?: string;
  changeTestId?: string;
  dataTestId?: string;
  className?: string;
}

const ACCENT_TEXT: Record<SummaryBandAccent, string> = {
  copper: 'text-copper',
  plum: 'text-plum',
  evergreen: 'text-evergreen',
};
const ACCENT_TINT_BG: Record<SummaryBandAccent, string> = {
  copper: 'bg-copper-tint',
  plum: 'bg-plum-tint',
  evergreen: 'bg-evergreen-tint',
};
const ACCENT_BORDER: Record<SummaryBandAccent, string> = {
  copper: 'border-copper/20',
  plum: 'border-plum/20',
  evergreen: 'border-evergreen/20',
};

function Stat({
  value,
  label,
  accent,
  testId,
}: {
  value: number | string;
  label: ReactNode;
  accent: SummaryBandAccent;
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col" data-testid={testId}>
      <span
        className={cn(
          'font-mono text-xl font-bold leading-none tracking-tight tabular-nums',
          ACCENT_TEXT[accent],
        )}
      >
        {value}
      </span>{' '}
      <span className="mt-1.5 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Shared "hero summary" tinted card — the model Batch B converts the three
 * solid-fill brand-colour bands to (SchoolsInAreaPanel selected-area summary,
 * SchoolSummaryBand + its skeleton, AgriGroupSelectedPanel corridor band).
 *
 * Border + tint, never a solid brand-colour fill; Fraunces title; mono Stat
 * row. Presentational only — callers own all copy/data and keep their
 * existing data-testid contract via `dataTestId` / `titleTestId` / per-stat
 * `testId` so this is a pure visual refactor (no test churn required beyond
 * matching selectors already covered by existing suites).
 */
export function SummaryBandCard({
  accent,
  icon: Icon,
  eyebrow,
  badge,
  breadcrumb,
  title,
  titleTestId,
  description,
  stats,
  onChange,
  changeLabel = 'Change',
  changeAriaLabel,
  changeTestId,
  dataTestId,
  className,
}: SummaryBandCardProps) {
  return (
    <div
      data-testid={dataTestId}
      className={cn('rounded-xl border bg-card p-5 shadow-sm', ACCENT_BORDER[accent], className)}
    >
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          data-testid={changeTestId}
          aria-label={changeAriaLabel}
          className="mb-3.5 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {changeLabel}
        </button>
      )}

      {breadcrumb}

      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            ACCENT_TINT_BG[accent],
            ACCENT_TEXT[accent],
          )}
        >
          <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {(eyebrow != null || badge != null) && (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {eyebrow != null && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {eyebrow}
                </span>
              )}
              {badge}
            </div>
          )}
          <h2
            data-testid={titleTestId}
            className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-[22px] font-semibold leading-tight tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description != null && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-7 border-t border-border pt-3.5">
          {stats.map((stat) => (
            <Stat key={stat.key} value={stat.value} label={stat.label} accent={accent} testId={stat.testId} />
          ))}
        </div>
      )}
    </div>
  );
}
