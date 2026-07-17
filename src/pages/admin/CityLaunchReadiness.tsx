import { useState } from 'react';
import { ShieldCheck, Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { VALIDATION_CHECK_ITEMS, type ValidationStateDto } from '@/hooks/useCityLaunchValidation';
import { useCityLaunchPromotion } from '@/hooks/useCityLaunchPromotion';
import { useCityLaunchList } from '@/hooks/useCityLaunch';
import { ApiError } from '@/lib/api';

/**
 * Issue #1911 PR5 — wires the real, doubly-guarded Launch action into PR4's
 * readiness screen. Reachable ONLY from within CityLaunchPreview's readiness
 * view (no new route). The type-to-confirm string is a UI-only guard — the
 * server's write authority is its own CAS + checksum, never this string
 * (AC2). The Launch button stays disabled until the admin types the exact
 * confirmation value.
 *
 * Confirmation target: ValidationStateDto carries no city-name field, so the
 * real cityName is resolved in-scope from useCityLaunchList() (the Select
 * City launch queue, already fetched elsewhere) by matching row.cityId ===
 * validation.cityId. Until that name is known (list loading, or no matching
 * row), the Launch affordance stays disabled — it never falls back to the
 * city id. Match is exact, case-sensitive, trimmed against the real name.
 */

export interface CityLaunchReadinessProps {
  validation: ValidationStateDto;
}

export default function CityLaunchReadiness({ validation }: CityLaunchReadinessProps) {
  const { cityId, revisionId, revisionNumber, lifecycleStatus, checks, preparedAt, validatedAt } =
    validation;

  const [confirmText, setConfirmText] = useState('');
  const promote = useCityLaunchPromotion(cityId, revisionId);
  const cityList = useCityLaunchList();

  const cityRow = cityList.data?.find((row) => row.cityId === cityId);
  const cityName = cityRow?.cityName;
  const isNameLoading = cityList.isLoading;
  const isNameMissing = !isNameLoading && !cityName;

  const target = cityName ?? '';
  const isMatch = Boolean(cityName) && confirmText.trim() === target;
  const alreadyPromoted = lifecycleStatus === 'PROMOTED';
  const isLaunchable = lifecycleStatus === 'VALIDATED';
  const showSuccess = promote.isSuccess || alreadyPromoted;

  function handleLaunch() {
    if (!isMatch || promote.isPending) return;
    promote.mutate({ confirmCityName: confirmText.trim() });
  }

  const errorStatus = promote.error instanceof ApiError ? promote.error.status : null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl" data-testid="city-launch-readiness">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Launch readiness</h2>
        <Badge className="bg-green-100 text-green-800 border border-green-300">
          {lifecycleStatus}
        </Badge>
        <span className="text-xs font-mono text-muted-foreground">
          city {cityId} · rev {revisionNumber}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-green-600" aria-hidden="true" />
            All {VALIDATION_CHECK_ITEMS.length} checkpoints validated
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border">
            {VALIDATION_CHECK_ITEMS.map(({ key, label, note }) => (
              <li key={key} className="flex items-center gap-3 py-2">
                <span
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-green-600 text-xs font-bold text-white"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <div>
                  <div className="text-sm font-semibold">
                    {label} — {note}
                  </div>
                </div>
                <span className="ml-auto text-xs font-mono text-green-700">
                  {checks[key] ? 'pass' : 'pending'}
                </span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">Prepared</span>
              <div className="font-mono">{preparedAt ?? '—'}</div>
            </div>
            <div>
              <span className="font-semibold text-foreground">Validated</span>
              <div className="font-mono">{validatedAt ?? '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showSuccess ? (
        <Alert className="mt-4 border-green-300 bg-green-50" data-testid="launch-success">
          <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />
          <AlertTitle className="text-green-800">This city is now live</AlertTitle>
          <AlertDescription className="text-green-800">
            {promote.data?.idempotentNoop
              ? 'Already launched — this was a repeat confirmation, no changes were made.'
              : 'Production geography has been promoted and the city is now active on Discover.'}
            {promote.data?.promotedAt && (
              <div className="mt-1 font-mono text-xs">Promoted at {promote.data.promotedAt}</div>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-4 flex items-start gap-2 rounded-md border bg-muted/30 p-4">
          <Lock className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {isLaunchable ? (
              <>
                {isNameLoading ? (
                  <p
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                    data-testid="launch-name-loading"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading city details…
                  </p>
                ) : isNameMissing ? (
                  <p className="text-sm text-destructive" data-testid="launch-name-unavailable">
                    Unable to load city name; cannot confirm launch.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Promoting this revision to production is irreversible for this launch. Type{' '}
                      <span className="font-mono font-semibold text-foreground">{target}</span> to
                      confirm.
                    </p>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="launch-confirm-input" className="text-xs">
                        Type the city name {target} to confirm
                      </Label>
                      <Input
                        id="launch-confirm-input"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={target}
                        disabled={promote.isPending}
                        aria-describedby="launch-confirm-hint"
                      />
                    </div>
                  </>
                )}
                <Button
                  type="button"
                  variant="default"
                  className="mt-3"
                  disabled={!isMatch || promote.isPending || isNameLoading || isNameMissing}
                  aria-disabled={!isMatch || promote.isPending || isNameLoading || isNameMissing}
                  data-testid="launch-entry"
                  onClick={handleLaunch}
                >
                  {promote.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {promote.isPending ? 'Launching…' : 'Launch city'}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="launch-not-ready">
                This revision is not currently launchable ({lifecycleStatus}).
              </p>
            )}

            {promote.isError && (
              <Alert variant="destructive" className="mt-3" data-testid="launch-error">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>
                  {errorStatus === 409 && 'Not ready to launch'}
                  {errorStatus === 422 && 'Preview has drifted'}
                  {errorStatus === 404 && 'Revision not found'}
                  {errorStatus !== 409 && errorStatus !== 422 && errorStatus !== 404 && 'Launch failed'}
                </AlertTitle>
                <AlertDescription>
                  {errorStatus === 409 &&
                    'This revision is no longer promotable — it may have been superseded or is already in flight.'}
                  {errorStatus === 422 &&
                    'The preview has drifted from what was validated. Re-run prepare and re-validate before launching.'}
                  {errorStatus === 404 && 'This revision could not be found for this city.'}
                  {errorStatus !== 409 &&
                    errorStatus !== 422 &&
                    errorStatus !== 404 &&
                    'Something went wrong launching this city. Please try again.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
