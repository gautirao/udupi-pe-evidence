import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #1953 build step 5 — HARD ARCHITECTURAL GATE. The control bar must
 * consume ONLY facade actions (useDiscoverNav/useDiscoverActions); it must
 * never reach around the facade to mutate the URL directly. This is a
 * mechanical source-text check (not a behavioural test) so the constraint
 * cannot silently regress in a future edit.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTROL_BAR_SOURCE = readFileSync(
  path.join(__dirname, '../DiscoverControlBar.tsx'),
  'utf-8',
);

describe('DiscoverControlBar — facade-only architectural gate', () => {
  it.each(['useSearchParams', 'useNavigate', 'history.push', 'setCity'])(
    'never references %s',
    (forbidden) => {
      expect(CONTROL_BAR_SOURCE).not.toContain(forbidden);
    },
  );
});
