import { useProcessPostsDataController } from '../controllers/useProcessPostsDataController';
import { useProcessPostsConsoleController } from '../controllers/useProcessPostsConsoleController';
import { useProcessPostsEditorController } from '../controllers/useProcessPostsEditorController';
import { useProcessPostsViewerController } from '../controllers/useProcessPostsViewerController';
import { useProcessPostsBatchController } from '../controllers/useProcessPostsBatchController';
import { useProcessPostsResetController } from '../controllers/useProcessPostsResetController';
import { buildProcessPostsSurfaceModel } from '../surfaces/buildProcessPostsSurfaceModel';
import { buildProcessPostsSurfaceCommands } from '../surfaces/buildProcessPostsSurfaceCommands';

/**
 * Issue #2662, commit C4 — wires the six controllers together in their
 * dependency order and derives the surface `view`/`commands` pair the thin
 * page renders. This is the ONLY place the controllers are composed;
 * `ProcessPosts.tsx` itself only calls this hook and renders sections.
 *
 * Wiring order (each depends on the previous):
 *  1. data     — no dependencies (server-state reads + partition/summary)
 *  2. console  — no dependencies (sole `useDebugLogs()` call site)
 *  3. editor   — needs `data.refetchPosts`
 *  4. viewer   — needs `editor.open` (View dialog's "Edit Post" button)
 *  5. batch    — needs `data.unprocessedPosts`/refetches, `console.debug`/`expand`
 *  6. reset    — needs `data.processedPosts`, `data.refetchPosts`, `console.debug`
 */
export function useProcessPostsPageComposition() {
  const data = useProcessPostsDataController();
  const console_ = useProcessPostsConsoleController();
  const editor = useProcessPostsEditorController({ refetchPosts: data.refetchPosts });
  const viewer = useProcessPostsViewerController({ openEditor: editor.open });
  const batch = useProcessPostsBatchController({
    unprocessedPosts: data.unprocessedPosts,
    refetchPosts: data.refetchPosts,
    refetchListings: data.refetchListings,
    debug: console_.debug,
    expandConsole: console_.expand,
  });
  const reset = useProcessPostsResetController({
    processedPosts: data.processedPosts,
    refetchPosts: data.refetchPosts,
    debug: console_.debug,
  });

  const params = { data, console: console_, batch, editor, viewer, reset };

  const view = buildProcessPostsSurfaceModel(params);
  const commands = buildProcessPostsSurfaceCommands(params);

  return { view, commands };
}
