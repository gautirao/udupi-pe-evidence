import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import MapDiscovery from '@/pages/MapDiscovery';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';
import { SimulatedPreviewRibbon } from '@/components/discover/SimulatedPreviewRibbon';

/**
 * Issue #1911 PR3 — admin city-launch revision preview
 * (/admin/city-launch/:cityId/preview/:revisionId).
 *
 * Wraps the UNMODIFIED production <MapDiscovery/> in a
 * DiscoverDataSourceProvider set to {mode:'preview', cityId, revisionId} so
 * an admin walks a revision's sandbox geography through the SAME Discover
 * UI a real buyer sees — not a forked admin screen. MapDiscovery itself is
 * never edited or copied; it reads the preview source entirely via the 5
 * threaded hooks + PropertyCard, both of which call useDiscoverSource()/
 * useDiscoverActionsEnabled() internally.
 */
export default function CityLaunchPreview() {
  const { cityId: cityIdParam, revisionId: revisionIdParam } = useParams<{
    cityId: string;
    revisionId: string;
  }>();
  const cityId = Number(cityIdParam);
  const revisionId = Number(revisionIdParam);
  const isValid =
    Number.isFinite(cityId) && Number.isFinite(revisionId) && cityId > 0 && revisionId > 0;

  if (!isValid) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 text-destructive"
        role="alert"
      >
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Invalid preview link — city or revision id is missing.</p>
      </div>
    );
  }

  return (
    <DiscoverDataSourceProvider value={{ mode: 'preview', cityId, revisionId }}>
      <SimulatedPreviewRibbon />
      <MapDiscovery />
    </DiscoverDataSourceProvider>
  );
}
