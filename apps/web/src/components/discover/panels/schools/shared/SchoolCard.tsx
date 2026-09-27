/**
 * SchoolCard — moved verbatim from SchoolJourneyPanels.tsx (Issue #2661 commit 3,
 * no logic/JSX changes). Also imported directly by
 * features/discover/views/SchoolsNavigationJourneyPanel.tsx.
 */
import { GraduationCap, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

export function SchoolCard({ school, onClick }: { school: SchoolResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-testid="school-card"
      className="group w-full text-left rounded-xl border border-border bg-card p-4 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-foreground truncate">{school.name}</span>
            {school.board && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {school.board}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{school.address}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
