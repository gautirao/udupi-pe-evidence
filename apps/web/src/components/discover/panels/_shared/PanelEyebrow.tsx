import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';

interface PanelEyebrowProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  /** Icon colour accent — defaults to the copper (area/residential) journey token. */
  accentClassName?: string;
  className?: string;
}

/**
 * Shared uppercase eyebrow row (icon + tracked-out label), extracted from
 * GuidedEntryPanel's "Discover {city}" eyebrow. Presentational only — callers
 * own the label copy and (optionally) the journey-accent icon colour.
 */
export function PanelEyebrow({
  icon: Icon,
  label,
  accentClassName = 'text-[hsl(var(--copper))]',
  className,
}: PanelEyebrowProps) {
  return (
    <div className={cn('mb-3.5 flex items-center gap-2', className)}>
      <Icon className={cn('h-[15px] w-[15px]', accentClassName)} aria-hidden="true" />
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
