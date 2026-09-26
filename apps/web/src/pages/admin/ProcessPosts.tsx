import { AppLayout } from '@/components/layout/AppLayout';
import { DebugConsole } from '@/components/admin/DebugConsole';
import { useProcessPostsPageComposition } from '@/features/admin/process-posts/composition/useProcessPostsPageComposition';
import { ProcessPostsHeader } from '@/features/admin/process-posts/surfaces/sections/ProcessPostsHeader';
import { ProcessPostsStats } from '@/features/admin/process-posts/surfaces/sections/ProcessPostsStats';
import { BatchProcessingCard } from '@/features/admin/process-posts/surfaces/sections/BatchProcessingCard';
import { RawPostsBrowserCard } from '@/features/admin/process-posts/surfaces/sections/RawPostsBrowserCard';
import { RecentListingsCard } from '@/features/admin/process-posts/surfaces/sections/RecentListingsCard';
import { EditPostDialog } from '@/features/admin/process-posts/surfaces/sections/EditPostDialog';
import { ViewPostDialog } from '@/features/admin/process-posts/surfaces/sections/ViewPostDialog';

/**
 * Issue #2662, commit C4 — thin composed page. All behavior lives in the six
 * controllers (`features/admin/process-posts/controllers`), composed by
 * `useProcessPostsPageComposition`; this file only renders sections against
 * the resulting `view`/`commands`. See `ProcessPosts.test.tsx` for the
 * characterization suite (C0) this decomposition must reproduce exactly.
 */
export default function ProcessPosts() {
  const { view, commands } = useProcessPostsPageComposition();

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl">
        <ProcessPostsHeader view={view.header} commands={commands.header} />

        <ProcessPostsStats view={view.stats} />

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Processing Panel */}
          <div className="space-y-6">
            <BatchProcessingCard view={view.batch} commands={commands.batch} />
            <RawPostsBrowserCard view={view.rawPosts} commands={commands.rawPosts} />
          </div>

          {/* Right Column - Debug Console & Recent Listings */}
          <div className="space-y-6">
            <DebugConsole
              logs={view.console.logs}
              onClear={commands.console.clearLogs}
              isCollapsed={view.console.isCollapsed}
              onToggleCollapse={commands.console.toggle}
            />

            <RecentListingsCard view={view.listings} />
          </div>
        </div>
      </div>

      <EditPostDialog view={view.editor} commands={commands.editor} />
      <ViewPostDialog view={view.viewer} commands={commands.viewer} />
    </AppLayout>
  );
}
