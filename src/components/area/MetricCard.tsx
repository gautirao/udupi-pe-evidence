import { ReactNode } from 'react';

interface MetricCardProps {
  /** Icon tile shown in the top-left */
  icon: ReactNode;
  /** Metric label — e.g. 'Active listings' */
  label: string;
  /** Helper copy shown below the label */
  helper: string;
  /**
   * The metric value (pre-formatted string) when available, or null when suppressed.
   * When null, confidenceLabel is rendered instead — never 0 (AC3, AC5).
   */
  value: string | null;
  /** Rendered when value is null — from Metric.confidenceLabel (never zero) */
  confidenceLabel: string;
  /** Optional extra className for the card container */
  className?: string;
  /** Optional tag rendered on the card (e.g. 'MOST RELEVANT') */
  tag?: string;
}

/**
 * Single at-a-glance metric card (AC3).
 * Renders value only when non-null; else renders confidenceLabel.
 * null NEVER becomes 0.
 */
export function MetricCard({
  icon,
  label,
  helper,
  value,
  confidenceLabel,
  className = '',
  tag,
}: MetricCardProps) {
  return (
    <div className={`relative rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm ${className}`}>
      {/* Icon tile (AC13 rounded icon tiles) */}
      <div className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
        {icon}
      </div>

      {/* Optional tag */}
      {tag && (
        <span className="absolute top-3 right-3 text-[10px] font-semibold tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          {tag}
        </span>
      )}

      {/* Value or confidenceLabel */}
      {value !== null ? (
        <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      ) : (
        <p className="text-sm font-medium text-slate-500 italic">{confidenceLabel}</p>
      )}

      {/* Label + helper */}
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{helper}</p>
      </div>
    </div>
  );
}

/** Confidence card — navy variant (last card in the 6-card grid) */
interface ConfidenceCardProps {
  label: string;
  helper: string;
}
export function ConfidenceCard({ label, helper }: ConfidenceCardProps) {
  const isEnough = label === 'Enough data';
  const isLimited = label === 'Limited data';
  // Three-way dot: emerald (enough) / amber (limited) / neutral slate (not enough data yet)
  const dotClass = isEnough ? 'bg-emerald-400' : isLimited ? 'bg-amber-400' : 'bg-slate-400';
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3 shadow-sm">
      <div className="h-8 w-8 rounded-lg bg-slate-700 flex items-center justify-center">
        <span className={`h-3 w-3 rounded-full ${dotClass}`} />
      </div>
      <p className="text-lg font-bold text-white leading-none">{label}</p>
      <div>
        <p className="text-sm font-semibold text-slate-300">Data confidence</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-snug">{helper}</p>
      </div>
    </div>
  );
}
