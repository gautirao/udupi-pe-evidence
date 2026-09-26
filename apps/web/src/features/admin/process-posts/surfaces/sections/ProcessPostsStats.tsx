import { Card, CardContent } from '@/components/ui/card';
import { Clock, CheckCircle2, Home, Zap } from 'lucide-react';
import type { ProcessPostsStatsView } from '../processPostsSurfaceContract';

export interface ProcessPostsStatsProps {
  view: ProcessPostsStatsView;
}

/** Issue #2662 — moved verbatim from ProcessPosts.tsx's 4-card stats grid. */
export function ProcessPostsStats({ view }: ProcessPostsStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div>
              <div className="text-2xl font-bold">{view.pendingCount}</div>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-2xl font-bold">{view.processedCount}</div>
              <p className="text-sm text-muted-foreground">Processed</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            <div>
              <div className="text-2xl font-bold">{view.listingsCount}</div>
              <p className="text-sm text-muted-foreground">Listings</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-500" />
            <div>
              <div className="text-2xl font-bold">{view.validCount}</div>
              <p className="text-sm text-muted-foreground">Valid</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
