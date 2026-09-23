import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Building2, Loader2, MapPinned, Sparkles } from 'lucide-react';
import {
  useCityLaunchList,
  useCityLaunchProgress,
  usePrepareCity,
  getPrepareCityErrorDetails,
  useStartCityBootstrap,
  useCityBootstrapJob,
  useConfirmCityBootstrap,
  type BootstrapJobStatus,
  type CityLaunchStatusDto,
  type PrepareErrorBody,
} from '@/hooks/useCityLaunch';
import { getCityLaunchStatusConfig } from '@/lib/cityLaunchStatus';

/**
 * Issue #1911 PR2 — Admin "Select City" launch queue.
 * ui_kits/admin/SelectCityScreen.jsx is the approved visual reference for
 * this table (city / status / geography meter / action). Only "Prepare
 * city" (not-started) and "Rerun" (failed) are wired to a real mutation in
 * this slice; ready-preview/ready-launch actions are inert placeholders
 * until PR3 (preview) and PR5 (launch) land.
 */
export default function CityLaunch() {
  const { data: cities, isLoading, isError, error, refetch } = useCityLaunchList();
  const prepareCity = usePrepareCity();
  const [expandedCityId, setExpandedCityId] = useState<number | null>(null);

  function handlePrepare(cityId: number) {
    prepareCity.mutate(cityId, {
      onSuccess: () => setExpandedCityId(cityId),
      onError: (err) => {
        if (getPrepareCityErrorDetails(err)) {
          setExpandedCityId(cityId);
        }
      },
    });
  }

  function toggleExpanded(cityId: number) {
    setExpandedCityId((current) => (current === cityId ? null : cityId));
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Choose a city to launch
          </h1>
          <p className="text-muted-foreground">
            Live cities are managed from Dashboard. Pick one below to begin the launch wizard.
          </p>
        </div>

        <LaunchNewCityPanel onCityCreated={() => refetch()} />

        {isLoading && (
          <Card>
            <CardContent className="pt-6 space-y-3" aria-live="polite">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        )}

        {isError && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-destructive" role="alert" aria-live="assertive">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm font-medium">
                Failed to load cities.{' '}
                {error instanceof Error ? error.message : 'Unknown error.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (cities?.length ?? 0) === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12" data-testid="city-launch-empty-state">
              <MapPinned className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No cities configured</p>
              <p className="text-muted-foreground">Cities will appear here once seeded.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (cities?.length ?? 0) > 0 && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Geography</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cities ?? []).map((city) => (
                  <CityLaunchRow
                    key={city.cityId}
                    city={city}
                    isPreparing={prepareCity.isPending && prepareCity.variables === city.cityId}
                    prepareError={
                      prepareCity.variables === city.cityId
                        ? getPrepareCityErrorDetails(prepareCity.error)
                        : null
                    }
                    isExpanded={expandedCityId === city.cityId}
                    onPrepare={() => handlePrepare(city.cityId)}
                    onToggleExpanded={() => toggleExpanded(city.cityId)}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * "Launch a new city" (#2676 Slice A) — type a name, Start launch, and either land straight
 * on the created city or be asked to disambiguate. Deliberately shows ONLY the states this
 * slice actually implements (resolving / disambiguation-required / created / failed) — the
 * fuller staged progress (importing boundary, discovering areas, generating regions...) from
 * the issue's mock is Slice B/C's job once those stages exist; a placeholder for unshipped
 * work would misreport what actually ran.
 */
function LaunchNewCityPanel({ onCityCreated }: { onCityCreated: () => void }) {
  const [name, setName] = useState('');
  const [jobId, setJobId] = useState<number | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  // Last fetched status, tracked outside react-query so polling can be driven by a plain
  // boolean rather than a `refetchInterval` callback closing over query-internal state.
  const [lastKnownStatus, setLastKnownStatus] = useState<BootstrapJobStatus | null>(null);

  const startBootstrap = useStartCityBootstrap();
  const stopPolling = lastKnownStatus !== null && lastKnownStatus !== 'RESOLVING';
  const { data: polledJob } = useCityBootstrapJob(jobId, jobId !== null, stopPolling);
  const confirmBootstrap = useConfirmCityBootstrap(jobId);
  // Fall back to the admission response while the first GET is still in flight, so the
  // "Resolving…" state shows immediately instead of a one-frame flicker back to the input.
  const job = polledJob ?? (jobId !== null ? startBootstrap.data : undefined);

  useEffect(() => {
    if (polledJob) {
      setLastKnownStatus(polledJob.status);
    }
  }, [polledJob]);

  // Refresh the city list the MOMENT this job reaches CITY_CREATED — not deferred to the
  // "Done" button. The success banner claims "it will appear below"; that claim must be true
  // at the instant it's shown, not only after a further manual click (#2676 Slice A, caught by
  // independent visual verification: the table in the CITY_CREATED screenshot still showed the
  // old 4-city list because this invalidation was previously gated behind onClick={handleDone}).
  useEffect(() => {
    if (polledJob?.status === 'CITY_CREATED') {
      onCityCreated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCityCreated is a stable prop callback (CityLaunch's refetch); re-running this on identity churn would re-fire the refetch every render.
  }, [polledJob?.status, polledJob?.jobId]);

  function handleStart() {
    if (!name.trim()) {
      return;
    }
    startBootstrap.mutate(name, {
      onSuccess: (started) => {
        setJobId(started.jobId);
        setSelectedCandidateIndex(null);
        setLastKnownStatus(started.status);
      },
    });
  }

  function handleConfirm() {
    if (selectedCandidateIndex === null) {
      return;
    }
    confirmBootstrap.mutate(selectedCandidateIndex);
  }

  function handleStartOver() {
    setJobId(null);
    setName('');
    setSelectedCandidateIndex(null);
    setLastKnownStatus(null);
  }

  return (
    <Card className="mb-6" data-testid="launch-new-city-panel">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Launch a new city</h2>
        </div>

        {job === undefined && (
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="e.g. Mysore"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              disabled={startBootstrap.isPending}
              className="max-w-sm"
              aria-label="City name"
            />
            <Button onClick={handleStart} disabled={startBootstrap.isPending || !name.trim()}>
              {startBootstrap.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Start launch
            </Button>
          </div>
        )}

        {job?.status === 'RESOLVING' && (
          <div className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" />
            Resolving "{job.requestedName}"…
          </div>
        )}

        {job?.status === 'DISAMBIGUATION_REQUIRED' && job.candidates && (
          <div className="space-y-3" aria-live="polite">
            <p className="text-sm">
              More than one place matches "{job.requestedName}". Choose the correct one:
            </p>
            <RadioGroup
              value={selectedCandidateIndex?.toString() ?? ''}
              onValueChange={(v) => setSelectedCandidateIndex(Number(v))}
            >
              {job.candidates.map((candidate, index) => (
                <div key={index} className="flex items-center gap-2">
                  <RadioGroupItem value={index.toString()} id={`candidate-${index}`} />
                  <Label htmlFor={`candidate-${index}`}>{candidate.displayName}</Label>
                </div>
              ))}
            </RadioGroup>
            <div className="flex gap-2">
              <Button
                onClick={handleConfirm}
                disabled={selectedCandidateIndex === null || confirmBootstrap.isPending}
              >
                {confirmBootstrap.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm city
              </Button>
              <Button variant="outline" onClick={handleStartOver}>
                Start over
              </Button>
            </div>
          </div>
        )}

        {job?.status === 'CITY_CREATED' && (
          <div className="flex items-center justify-between gap-3" aria-live="polite">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              "{job.requestedName}" is now a canonical city (id {job.resolvedCityId}). It will appear
              below — use "Prepare city" to continue.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartOver}
            >
              Done
            </Button>
          </div>
        )}

        {job?.status === 'FAILED' && (
          <div className="space-y-2" role="alert" aria-live="assertive">
            <p className="text-sm text-destructive">
              Could not launch "{job.requestedName}": {job.failureReason ?? job.failureCode}
            </p>
            <Button variant="outline" size="sm" onClick={handleStartOver}>
              Try again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CityLaunchRowProps {
  city: CityLaunchStatusDto;
  isPreparing: boolean;
  prepareError: PrepareErrorBody | null;
  isExpanded: boolean;
  onPrepare: () => void;
  onToggleExpanded: () => void;
}

function CityLaunchRow({ city, isPreparing, prepareError, isExpanded, onPrepare, onToggleExpanded }: CityLaunchRowProps) {
  const config = getCityLaunchStatusConfig(city.status);
  const progress = useCityLaunchProgress(city.cityId, isExpanded);
  const navigate = useNavigate();

  function handleAction() {
    if (city.status === 'not-started') {
      onPrepare();
      return;
    }
    if (city.status === 'preparing' || city.status === 'failed') {
      onToggleExpanded();
      return;
    }
    if (city.status === 'ready-preview' || city.status === 'ready-launch') {
      if (city.revisionId != null) {
        navigate(`/admin/city-launch/${city.cityId}/preview/${city.revisionId}`);
      }
      return;
    }
  }

  // Issue #2121 — a Live city's `revisionId` is already the current LIVE
  // revision (CityLaunchReadService.listCities derives every status from the
  // city's MAX-revision_number row, so for status=live that row IS the
  // promoted one). This is a plain GET-backed navigation, distinct from
  // "Generate new revision" below — it never creates a revision.
  function handleViewCurrentRevision() {
    if (city.revisionId != null) {
      navigate(`/admin/city-launch/${city.cityId}/preview/${city.revisionId}`);
    }
  }

  const actionDisabled = !config.actionEnabled || isPreparing;
  const tooltipText = config.actionTooltip;

  const actionButton = (
    <Button
      variant={city.status === 'not-started' ? 'default' : 'outline'}
      size="sm"
      disabled={actionDisabled}
      onClick={handleAction}
    >
      {isPreparing ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : null}
      {prepareError ? 'Retry' : config.actionLabel}
    </Button>
  );

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="font-medium">{city.cityName}</div>
          <div className="text-xs text-muted-foreground font-mono">{city.citySlug}</div>
        </TableCell>
        <TableCell>
          <Badge className={config.badgeClassName}>{config.label}</Badge>
        </TableCell>
        <TableCell>
          <GeographyMeter percent={city.geographyPercent} revisionNumber={city.revisionNumber} failed={city.status === 'failed'} />
        </TableCell>
        <TableCell className="text-right">
          {city.status === 'live' ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={city.revisionId == null}
                onClick={handleViewCurrentRevision}
              >
                View current revision
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={isPreparing} onClick={onPrepare}>
                {isPreparing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Generate new revision
              </Button>
            </div>
          ) : (
            <>
              {tooltipText ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* span wrapper: disabled buttons don't fire pointer events for the Radix tooltip trigger */}
                    <span className="inline-block" tabIndex={0}>
                      {actionButton}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{tooltipText}</TooltipContent>
                </Tooltip>
              ) : (
                actionButton
              )}
              {city.status === 'failed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2"
                  disabled={isPreparing}
                  onClick={onPrepare}
                >
                  Rerun
                </Button>
              )}
            </>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow data-testid={`city-launch-detail-${city.cityId}`}>
          <TableCell colSpan={4} className="bg-muted/30">
            {prepareError && (
              <div className="text-sm text-destructive space-y-1" role="alert" aria-live="assertive">
                <p>{prepareError.message}</p>
                <p className="text-muted-foreground">{prepareError.remediation}</p>
              </div>
            )}
            {!prepareError && city.status === 'failed' && (
              <p className="text-sm text-destructive">
                {city.failureReason ?? 'Preparation failed for an unknown reason.'}
              </p>
            )}
            {city.status === 'preparing' && (
              <div className="text-sm text-muted-foreground" aria-live="polite">
                {progress.isLoading && 'Loading progress…'}
                {progress.isError && 'Unable to load progress right now.'}
                {progress.data && (
                  <span>
                    {progress.data.prepStageLabel} — {progress.data.geographyPercent}%
                  </span>
                )}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

interface GeographyMeterProps {
  percent: number;
  revisionNumber: number | null;
  failed: boolean;
}

function GeographyMeter({ percent, revisionNumber, failed }: GeographyMeterProps) {
  const barColor = failed ? 'bg-destructive' : percent >= 100 ? 'bg-green-600' : percent > 0 ? 'bg-amber-500' : 'bg-muted-foreground/30';

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground">
        {revisionNumber ? `rev ${revisionNumber}` : 'none'}
      </span>
      <span className="text-xs font-mono text-muted-foreground">{percent}%</span>
    </div>
  );
}
