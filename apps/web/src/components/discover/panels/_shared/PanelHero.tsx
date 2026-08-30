import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelHeroProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 'landing' = 40px city-landing scale (GuidedEntryPanel). 'selected' = the
   * smaller drill-down scale used by AreaGroupsLandingPanel-style panels. */
  size?: 'landing' | 'selected';
  className?: string;
}

const FRAUNCES = "font-['Fraunces',_ui-serif,_Georgia,_serif]";

/**
 * Shared Fraunces hero heading + sub-copy, extracted from GuidedEntryPanel /
 * AreaGroupsLandingPanel (identical type scale, two size variants). Presentational
 * only — callers own all copy.
 */
export function PanelHero({ title, subtitle, size = 'landing', className }: PanelHeroProps) {
  return (
    <div className={className}>
      <h1
        className={cn(
          FRAUNCES,
          'font-semibold leading-[1.1] tracking-[-0.02em] text-foreground',
          size === 'landing'
            ? 'mb-3.5 text-3xl lg:text-[40px]'
            : 'mb-[13px] text-[28px] sm:text-3xl lg:text-[38px]',
        )}
      >
        {title}
      </h1>
      {subtitle != null && (
        <p className="mb-6 max-w-[48ch] text-[14.5px] leading-relaxed text-muted-foreground lg:text-[16px]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
