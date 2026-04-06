import { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface School {
  id: string;
  name: string;
  distanceKm: number;
  board: string | null;
  boardType?: string | null;
  prominenceTier: 'notable' | 'directory' | null;
}

interface Props {
  schools: School[];
}

const PAGE_SIZE = 5;

function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000 / 10) * 10} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

export function SchoolsList({ schools }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (schools.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-base font-semibold">Nearby schools</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No schools found within 3 km</p>
        </CardContent>
      </Card>
    );
  }

  const visible = expanded ? schools : schools.slice(0, PAGE_SIZE);
  const hasMore = schools.length > PAGE_SIZE;

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-base font-semibold">Nearby schools</h3>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {visible.map((school) => {
            const boardLabel = school.board ?? school.boardType ?? null;
            return (
              <li key={school.id} className="flex items-center justify-between gap-4 px-6 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-sm font-medium max-w-[240px]">{school.name}</span>
                  {school.prominenceTier === 'notable' && (
                    <Badge variant="secondary" className="shrink-0 text-xs">Notable</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0 text-sm text-muted-foreground">
                  <span>{boardLabel ?? '—'}</span>
                  <span className="tabular-nums">{formatDistance(school.distanceKm)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {hasMore && (
          <div className="px-6 py-3 border-t border-border">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-sm text-primary underline underline-offset-4"
            >
              {expanded ? 'Show less' : `See all (${schools.length})`}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
