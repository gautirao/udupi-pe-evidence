/**
 * Result-scope display names — Issue #2419 (PR-1).
 *
 * Mirrors the design kit's own single source of truth for these four strings
 * (`docs/design/retrends-design-system/ui_kits/new_discover/src/ExpPanel.jsx`
 * `SCOPE_TITLE`). Before this issue the same words were hard-coded at each
 * call site ("Visible map area" inside ActiveScopeChip, "Selected areas"
 * inside AreaSetSelectedExtras) with no shared definition, so adding the
 * POLYGON name would have made three independent copies rather than two.
 */
import type { ResultScope } from '@/features/discover/state/resultScope';

export const SCOPE_TITLE: Readonly<Record<Exclude<ResultScope, null>['kind'], string>> = {
  AREA_SET: 'Selected areas',
  POLYGON: 'Drawn area',
  VIEWPORT: 'Visible map area',
};
