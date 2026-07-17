import { Eye } from 'lucide-react';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';

/**
 * Issue #1911 PR3 — the sole visual discriminator between live Discover and
 * an admin's sandbox revision preview (CityLaunchPreview.tsx). Persistent
 * (not dismissible) while mode === 'preview'; renders nothing in live mode,
 * including everywhere in the app that has no DiscoverDataSourceProvider
 * (the default context value is {mode:'live'}).
 */
export function SimulatedPreviewRibbon() {
  const source = useDiscoverSource();
  if (source.mode !== 'preview') return null;

  return (
    <div
      role="status"
      data-testid="simulated-preview-ribbon"
      className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-950 shadow-sm"
    >
      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
      Simulated · Preview
    </div>
  );
}
