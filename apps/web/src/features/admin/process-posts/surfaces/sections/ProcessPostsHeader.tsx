import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { ProcessPostsHeaderView, ProcessPostsHeaderCommands } from '../processPostsSurfaceContract';

export interface ProcessPostsHeaderProps {
  view: ProcessPostsHeaderView;
  commands: ProcessPostsHeaderCommands;
}

/** Issue #2662 — moved verbatim from ProcessPosts.tsx's title/refresh block. */
export function ProcessPostsHeader({ view, commands }: ProcessPostsHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Process Posts
        </h1>
        <p className="text-muted-foreground">AI-powered extraction of property listings</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={commands.refresh} disabled={view.isLoadingPosts}>
          <RefreshCw className={`h-4 w-4 ${view.isLoadingPosts ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  );
}
