/**
 * Issue #2660 (C5) — TEST-ONLY harness. Renders the real
 * `DiscoverAreasJourneyPanel` from the specs' flat scenario vocabulary via
 * `toAreasJourneyPanelProps`. Like the production caller, it rebuilds the
 * `{view, commands}` objects on every render, so the pre-existing specs also
 * exercise the panel under realistic per-render object churn (H1).
 */
import { DiscoverAreasJourneyPanel } from '@/features/discover/views/DiscoverAreasJourneyPanel';
import { toAreasJourneyPanelProps } from './areasJourneyPanelTestAdapter';
import type { FlatAreasJourneyPanelProps } from './areasJourneyPanelTestAdapter';

export function FlatPropsAreasJourneyPanel(props: FlatAreasJourneyPanelProps) {
  return <DiscoverAreasJourneyPanel {...toAreasJourneyPanelProps(props)} />;
}
