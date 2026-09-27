/**
 * School journey panels — barrel re-export only (Issue #2661 commit 4).
 *
 * The 4 public panels and SchoolCard now live under ./schools/. This file
 * exists solely so existing import paths (production callers, tests, and
 * commitAllowlist.2553.test.tsx's `vi.mock('@/components/discover/panels/SchoolJourneyPanels', ...)`)
 * keep working unchanged at this commit — its contract has not changed yet.
 *
 * Guarded by schoolJourneyPanels.barrelOnly.test.ts: this file must contain
 * ONLY `export ... from` statements.
 */
export { SchoolBrowsePanel } from './schools/browse/SchoolBrowsePanel';
export type { SchoolBrowsePanelProps } from './schools/browse/SchoolBrowsePanel';
export { SchoolsInAreaPanel } from './schools/area/SchoolsInAreaWithHomesPanel';
export type { SchoolsInAreaPanelProps } from './schools/area/SchoolsInAreaWithHomesPanel';
export { SchoolSelectedPanel } from './schools/selected/SchoolSelectedPanel';
export type { SchoolSelectedPanelProps } from './schools/selected/SchoolSelectedPanel';
export { AreaSchoolCombinedPanel } from './schools/combined/AreaSchoolCombinedPanel';
export type { AreaSchoolCombinedPanelProps } from './schools/combined/AreaSchoolCombinedPanel';
// Re-exported (not just imported): features/discover/views/SchoolsNavigationJourneyPanel.tsx
// imports SchoolCard from this module's public surface — preserve that path.
export { SchoolCard } from './schools/shared/SchoolCard';
