import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional element rendered at the right of the header (e.g. a status badge). */
  headerAdornment?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Presentational wrapper for a polished form section: a white card with a
 * compact title/description header, a hairline divider, and consistent
 * content padding. Used across the create/edit listing flow to group fields.
 */
export function SectionCard({
  title,
  description,
  headerAdornment,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {headerAdornment}
        </div>
      </CardHeader>
      <div className="mx-6 border-t" />
      <CardContent className={cn('space-y-5 pt-5', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
