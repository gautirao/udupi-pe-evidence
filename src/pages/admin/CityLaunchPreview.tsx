import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import MapDiscovery from '@/pages/MapDiscovery';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';
import { SimulatedPreviewRibbon } from '@/components/discover/SimulatedPreviewRibbon';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NavigationHierarchyTree } from '@/components/discover/cityLaunchPreview/NavigationHierarchyTree';
import { NavigationDiffView } from '@/components/discover/cityLaunchPreview/NavigationDiffView';
import { NavigationOverridesPanel } from '@/components/discover/cityLaunchPreview/NavigationOverridesPanel';
import {
  useValidationState,
  useToggleCheck,
  useMarkValidated,
  useResetValidation,
  useRerunPreview,
  VALIDATION_CHECK_ITEMS,
  type CityLaunchValidationCheckKey,
} from '@/hooks/useCityLaunchValidation';
import CityLaunchReadiness from '@/pages/admin/CityLaunchReadiness';

/**
 * Issue #1911 PR3/PR4 — admin city-launch revision preview
 * (/admin/city-launch/:cityId/preview/:revisionId).
 *
 * Wraps the UNMODIFIED production <MapDiscovery/> in a
 * DiscoverDataSourceProvider set to {mode:'preview', cityId, revisionId} so
 * an admin walks a revision's sandbox geography through the SAME Discover
 * UI a real buyer sees — not a forked admin screen. MapDiscovery itself is
 * never edited or copied; it reads the preview source entirely via the 5
 * threaded hooks + PropertyCard, both of which call useDiscoverSource()/
 * useDiscoverActionsEnabled() internally.
 *
 * PR4 attaches a server-backed validation rail alongside the map (never a
 * local-only checklist that resets on reload — every toggle round-trips
 * through useCityLaunchValidation) and, once the revision is VALIDATED and
 * not superseded, an inline launch-readiness sub-view — reachable only from
 * here, no new top-level route.
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

  const [view, setView] = useState<'preview' | 'readiness'>('preview');
  // Issue #1955 (Areas PR A) — which sub-view of the preview surface is
  // showing. Separate from `view` (buyer-preview vs launch-readiness),
  // which is unaffected by this PR.
  const [subView, setSubView] = useState<'map' | 'hierarchy' | 'diff' | 'overrides'>('map');

  const validationState = useValidationState(cityId, revisionId);
  const toggleCheck = useToggleCheck(cityId, revisionId);
  const markValidated = useMarkValidated(cityId, revisionId);
  const resetValidation = useResetValidation(cityId, revisionId);
  const rerunPreview = useRerunPreview(cityId, revisionId);

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

  const validation = validationState.data;
  const editable = validation?.editable ?? false;
  const superseded = !editable && validation != null;
  // Issue #1955 (Areas PR A) item 6 — overrides are backend-enforced to
  // PREPARED revisions only; gated here on lifecycle_status specifically
  // (distinct from the 5-check `editable` flag above, which tracks the
  // validation checklist rather than override eligibility).
  const overridesEditable = validation?.lifecycleStatus === 'PREPARED';

  if (view === 'readiness' && validation) {
    return (
      <div className="flex min-h-screen flex-col">
        <SimulatedPreviewRibbon />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mx-auto mt-4 w-fit"
          onClick={() => setView('preview')}
        >
          Back to preview
        </Button>
        <CityLaunchReadiness validation={validation} />
      </div>
    );
  }

  function handleToggle(checkKey: CityLaunchValidationCheckKey, checked: boolean) {
    toggleCheck.mutate({ checkKey, value: checked });
  }

  function handleMarkValidated() {
    markValidated.mutate(undefined, {
      onSuccess: (data) => {
        if (data.lifecycleStatus === 'VALIDATED' && data.supersededBy == null) {
          setView('readiness');
        }
      },
    });
  }

  return (
    <DiscoverDataSourceProvider value={{ mode: 'preview', cityId, revisionId }}>
      <SimulatedPreviewRibbon />
      <Tabs
        value={subView}
        onValueChange={(value) => {
          if (value === 'map' || value === 'hierarchy' || value === 'diff' || value === 'overrides') {
            setSubView(value);
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-4 w-fit">
          <TabsTrigger value="map">Buyer preview</TabsTrigger>
          <TabsTrigger value="hierarchy">Hierarchy tree</TabsTrigger>
          <TabsTrigger value="diff">Diff</TabsTrigger>
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy" className="min-h-0 flex-1 overflow-y-auto">
          <NavigationHierarchyTree />
        </TabsContent>
        <TabsContent value="diff" className="min-h-0 flex-1 overflow-y-auto">
          <NavigationDiffView />
        </TabsContent>
        <TabsContent value="overrides" className="min-h-0 flex-1 overflow-y-auto">
          <NavigationOverridesPanel editable={overridesEditable} />
        </TabsContent>

        <TabsContent value="map" className="flex min-h-0 flex-1" forceMount hidden={subView !== 'map'}>
        <aside
          className="w-80 flex-none overflow-y-auto border-r bg-muted/20 p-4"
          data-testid="validation-rail"
        >
          <h2 className="text-base font-semibold">Review this preview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Walk the map like a buyer would, then tick each part you've checked. You can untick
            and revisit anything.
          </p>

          {superseded && (
            <Alert variant="destructive" className="mt-4" data-testid="superseded-banner">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>No longer current</AlertTitle>
              <AlertDescription>
                This revision has been superseded / is no longer current.
              </AlertDescription>
            </Alert>
          )}

          {validationState.isLoading && (
            <div className="mt-4 space-y-2" aria-live="polite">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {validationState.isError && !validationState.isLoading && (
            <div className="mt-4 flex flex-col items-center gap-2 text-destructive" role="alert">
              <AlertCircle className="h-6 w-6" />
              <p className="text-xs font-medium">Failed to load validation state.</p>
              <Button variant="outline" size="sm" onClick={() => validationState.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {validation && (
            <>
              <div className="mt-4 flex flex-col gap-2">
                {VALIDATION_CHECK_ITEMS.map(({ key, label, note }) => (
                  <div key={key} className="flex items-start gap-3 rounded-md border p-3 text-left">
                    <Checkbox
                      aria-label={label}
                      checked={validation.checks[key]}
                      disabled={!editable}
                      onCheckedChange={(checked) => handleToggle(key, checked === true)}
                    />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted-foreground">{note}</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t pt-4">
                {validation.lifecycleStatus === 'VALIDATED' && !superseded ? (
                  <Button
                    type="button"
                    onClick={() => setView('readiness')}
                  >
                    Review & launch
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      disabled={!editable || !validation.allValidated || markValidated.isPending}
                      onClick={handleMarkValidated}
                    >
                      {markValidated.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Mark preview validated
                    </Button>
                    {!validation.allValidated && (
                      <p className="text-center text-[10px] text-muted-foreground">
                        Enabled once all five are checked
                      </p>
                    )}
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!editable || rerunPreview.isPending}
                  onClick={() => rerunPreview.mutate()}
                >
                  {rerunPreview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Preview not ready
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!editable || resetValidation.isPending}
                  onClick={() => resetValidation.mutate()}
                >
                  Reset validation
                </Button>
              </div>
            </>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <MapDiscovery />
        </div>
        </TabsContent>
      </Tabs>
    </DiscoverDataSourceProvider>
  );
}
