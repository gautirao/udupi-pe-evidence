import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2658 (C6) — props-budget guard.
 *
 * The whole point of C5's {view, commands} contract flip is that
 * AreaSelectedPanel's PUBLIC surface — what a caller must construct to
 * render it — stays at exactly two top-level members, however many
 * capability groups grow inside `view`/`commands` over time. This guard is
 * only meaningful post-flip: before C5, `AreaSelectedPanelProps` WAS the
 * ~40-field flat interface, so an equivalent assertion pre-flip would have
 * pinned the very sprawl #2658 exists to collapse.
 *
 * Static source-text guard, matching this file's sibling guards
 * (`usePropertyFilterGroupsSingleCallSite.guard.test.ts`,
 * `importDirection.guard.test.ts`): parses the `AreaSelectedPanelProps`
 * interface declaration directly out of AreaSelectedPanel.tsx rather than
 * importing types (there is nothing to assert about a type at runtime), so
 * a future props addition must widen `view`/`commands` themselves rather
 * than reopening a third top-level field on the props interface.
 */
const PANEL_SOURCE_PATH = path.resolve(__dirname, '../AreaSelectedPanel.tsx');

describe('#2658 C6 — AreaSelectedPanel props-budget guard', () => {
  it('exposes exactly {view, commands} as its public prop surface', () => {
    const source = fs.readFileSync(PANEL_SOURCE_PATH, 'utf-8');

    const interfaceMatch = source.match(
      /interface AreaSelectedPanelProps \{([\s\S]*?)\n\}/,
    );
    expect(interfaceMatch).not.toBeNull();

    const body = interfaceMatch![1];
    // Top-level fields only: lines at the interface's own single-tab
    // indent, of the form `  name: Type;` — nested object/type bodies
    // inside view/commands are indented further and must not count.
    const topLevelFields = body
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => /^ {2}[a-zA-Z]\w*: /.test(line));

    expect(topLevelFields).toHaveLength(2);
    expect(topLevelFields.map((line) => line.trim().split(':')[0])).toEqual([
      'view',
      'commands',
    ]);
  });
});
