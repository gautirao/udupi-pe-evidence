import { useState } from 'react';
import { useDebugLogs } from '@/components/admin/DebugConsole';

/**
 * Issue #2662 — the SOLE call site for `useDebugLogs()` across the whole
 * ProcessPosts feature (a second call would split the log stream), plus the
 * `consoleCollapsed` UI state it was originally colocated with in the page.
 */
export function useProcessPostsConsoleController() {
  const debug = useDebugLogs();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggle = () => setIsCollapsed((prev) => !prev);
  const expand = () => setIsCollapsed(false);

  return {
    debug,
    isCollapsed,
    toggle,
    expand,
  };
}

export type ProcessPostsConsoleController = ReturnType<typeof useProcessPostsConsoleController>;
