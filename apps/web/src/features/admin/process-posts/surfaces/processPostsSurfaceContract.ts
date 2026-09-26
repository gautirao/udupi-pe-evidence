import type { AdminListingRow } from '@/hooks/useAdminData';
import type { LogEntry } from '@/components/admin/DebugConsole';
import type { useProcessPostsDataController } from '../controllers/useProcessPostsDataController';
import type { useProcessPostsConsoleController } from '../controllers/useProcessPostsConsoleController';
import type {
  useProcessPostsBatchController,
  ProcessingResult,
} from '../controllers/useProcessPostsBatchController';
import type { useProcessPostsEditorController } from '../controllers/useProcessPostsEditorController';
import type { useProcessPostsViewerController } from '../controllers/useProcessPostsViewerController';
import type { useProcessPostsResetController } from '../controllers/useProcessPostsResetController';

/**
 * Issue #2662 — ProcessPostsSurface's INPUT contract: the six controllers'
 * own result objects, narrowed with `Pick` to the fields this surface
 * actually reads. The composition hook passes controller references
 * straight through (see `useProcessPostsPageComposition.ts`), so a
 * controller renaming a field is a compile error here rather than a silent
 * drift — the same pattern `frontend-page-architecture.md` establishes for
 * `/discover`'s panel surface.
 */
export interface BuildProcessPostsSurfaceParams {
  data: Pick<
    ReturnType<typeof useProcessPostsDataController>,
    | 'unprocessedPosts'
    | 'processedPosts'
    | 'recentListings'
    | 'validListingCount'
    | 'listings'
    | 'isLoadingPosts'
    | 'isLoadingListings'
    | 'refresh'
  >;
  console: Pick<ReturnType<typeof useProcessPostsConsoleController>, 'debug' | 'isCollapsed' | 'toggle'>;
  batch: Pick<ReturnType<typeof useProcessPostsBatchController>, 'isProcessing' | 'progress' | 'result' | 'process'>;
  editor: Pick<
    ReturnType<typeof useProcessPostsEditorController>,
    'editingPost' | 'editContent' | 'isSaving' | 'open' | 'close' | 'setContent' | 'save'
  >;
  viewer: Pick<
    ReturnType<typeof useProcessPostsViewerController>,
    'viewingPost' | 'open' | 'close' | 'editViewed'
  >;
  reset: Pick<ReturnType<typeof useProcessPostsResetController>, 'isResettingAll' | 'resetPost' | 'resetAll'>;
}

export interface ProcessPostsHeaderView {
  isLoadingPosts: boolean;
}
export interface ProcessPostsHeaderCommands {
  refresh: () => void;
}

export interface ProcessPostsStatsView {
  pendingCount: number;
  processedCount: number;
  listingsCount: number;
  validCount: number;
}

export interface ProcessPostsBatchView {
  isProcessing: boolean;
  progress: number;
  result: ProcessingResult | null;
  hasUnprocessed: boolean;
}
export interface ProcessPostsBatchCommands {
  process: (batchSize?: number) => Promise<void>;
}

export interface ProcessPostsRawPostsView {
  unprocessedPosts: ReturnType<typeof useProcessPostsDataController>['unprocessedPosts'];
  processedPosts: ReturnType<typeof useProcessPostsDataController>['processedPosts'];
  isResettingAll: boolean;
}
export interface ProcessPostsRawPostsCommands {
  viewPost: (post: ProcessPostsRawPostsView['unprocessedPosts'][number]) => void;
  editPost: (post: ProcessPostsRawPostsView['unprocessedPosts'][number]) => void;
  resetPost: (postId: string) => Promise<void>;
  resetAll: () => Promise<void>;
}

export interface ProcessPostsListingsView {
  recentListings: AdminListingRow[];
  isLoadingListings: boolean;
}

export interface ProcessPostsConsoleView {
  logs: LogEntry[];
  isCollapsed: boolean;
}
export interface ProcessPostsConsoleCommands {
  toggle: () => void;
  clearLogs: () => void;
}

export interface ProcessPostsEditorView {
  editingPost: ReturnType<typeof useProcessPostsEditorController>['editingPost'];
  editContent: string;
  isSaving: boolean;
}
export interface ProcessPostsEditorCommands {
  setContent: (value: string) => void;
  save: () => Promise<void>;
  close: () => void;
}

export interface ProcessPostsViewerView {
  viewingPost: ReturnType<typeof useProcessPostsViewerController>['viewingPost'];
}
export interface ProcessPostsViewerCommands {
  close: () => void;
  editViewed: () => void;
}

export interface ProcessPostsSurfaceView {
  header: ProcessPostsHeaderView;
  stats: ProcessPostsStatsView;
  batch: ProcessPostsBatchView;
  rawPosts: ProcessPostsRawPostsView;
  listings: ProcessPostsListingsView;
  console: ProcessPostsConsoleView;
  editor: ProcessPostsEditorView;
  viewer: ProcessPostsViewerView;
}

export interface ProcessPostsSurfaceCommands {
  header: ProcessPostsHeaderCommands;
  batch: ProcessPostsBatchCommands;
  rawPosts: ProcessPostsRawPostsCommands;
  console: ProcessPostsConsoleCommands;
  editor: ProcessPostsEditorCommands;
  viewer: ProcessPostsViewerCommands;
}
