/**
 * DiscoverPrivacyToggle — persistent revocable telemetry preference control.
 *
 * Reflects the current getConsentState() on render.
 * Allow  → grantTelemetryConsent()
 * Off    → revokeTelemetryConsent()
 *
 * All storage access via the try/catch-wrapped helpers in discoverTelemetryConsent.ts.
 * This component emits NO telemetry of its own.
 */

import { useReducer } from 'react';
import { Button } from '@/components/ui/button';
import {
  grantTelemetryConsent,
  revokeTelemetryConsent,
  getConsentState,
} from '@/lib/discoverTelemetryConsent';

export function DiscoverPrivacyToggle() {
  // Tick counter: incrementing forces a re-render so getConsentState() is always
  // read fresh from storage (never stale within the session, e.g. after the banner
  // grants consent in the same React tree).
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

  // Derived directly from storage on every render — never cached in local state.
  const isGranted = getConsentState() === 'granted';

  function handleAllow() {
    grantTelemetryConsent();
    forceUpdate();
  }

  function handleRevoke() {
    revokeTelemetryConsent();
    // After removeItem the key is absent → 'undecided' (no-emit state).
    forceUpdate();
  }

  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="discover-privacy-toggle"
    >
      <span>Usage data:</span>
      <Button
        variant={isGranted ? 'secondary' : 'outline'}
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={isGranted ? handleRevoke : handleAllow}
        aria-pressed={isGranted}
        aria-label={
          isGranted
            ? 'Turn off anonymous usage data collection'
            : 'Allow anonymous usage data collection'
        }
      >
        {isGranted ? 'On' : 'Off'}
      </Button>
    </div>
  );
}
