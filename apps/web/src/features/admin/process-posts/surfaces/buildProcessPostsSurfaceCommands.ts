import type { BuildProcessPostsSurfaceParams, ProcessPostsSurfaceCommands } from './processPostsSurfaceContract';

/**
 * Issue #2662 — pure function, controller commands in, `commands` object
 * out. `rawPosts.viewPost`/`rawPosts.editPost` are the viewer/editor
 * controllers' own `open()`, renamed here to the post-specific names the
 * original page's `handleViewPost`/`handleEditPost` used — the two
 * controllers' `open()` share a name only because both dialogs' state
 * shapes are structurally identical, not because they're the same action.
 */
export function buildProcessPostsSurfaceCommands(
  params: BuildProcessPostsSurfaceParams,
): ProcessPostsSurfaceCommands {
  const {
    data: { refresh },
    console: { toggle, debug },
    batch: { process },
    editor: { open: openEditor, close: closeEditor, setContent, save },
    viewer: { open: openViewer, close: closeViewer, editViewed },
    reset: { resetPost, resetAll },
  } = params;

  return {
    header: { refresh },
    batch: { process },
    rawPosts: {
      viewPost: openViewer,
      editPost: openEditor,
      resetPost,
      resetAll,
    },
    console: {
      toggle,
      clearLogs: debug.clearLogs,
    },
    editor: {
      setContent,
      save,
      close: closeEditor,
    },
    viewer: {
      close: closeViewer,
      editViewed,
    },
  };
}
