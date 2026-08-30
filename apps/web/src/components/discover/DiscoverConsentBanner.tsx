/**
 * DiscoverConsentBanner — first-visit telemetry consent notice for the Discover page.
 *
 * Rendered ONLY when getConsentState() === 'undecided' (key absent or storage throw).
 * No auto-grant on mount — explicit user action required.
 *
 * Accept  → grantTelemetryConsent() — writes 'granted'; banner unmounts.
 * Decline → revokeTelemetryConsent() — removes key (key stays absent) + sets local
 *           `dismissed` flag so the banner hides for this session without re-mounting.
 *           On next page load the key is still absent so the user may see the banner again;
 *           this is intentional (no persistent "declined" sentinel is written).
 *
 * This component emits NO telemetry of its own.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  grantTelemetryConsent,
  revokeTelemetryConsent,
  getConsentState,
} from '@/lib/discoverTelemetryConsent';

export function DiscoverConsentBanner() {
  // dismissed: true after Decline so the banner hides for this session even though
  // revokeTelemetryConsent() leaves the key absent (which would read as 'undecided').
  const [dismissed, setDismissed] = useState(false);

  const consentState = getConsentState();

  // Render nothing when already decided or dismissed this session.
  if (consentState !== 'undecided' || dismissed) {
    return null;
  }

  function handleAccept() {
    grantTelemetryConsent();
    // Force re-render: getConsentState() will now return 'granted' → component returns null.
    // We rely on React re-rendering after state update; toggle dismissed to trigger it.
    setDismissed(true); // banner hides; the new 'granted' state is now in localStorage.
  }

  function handleDecline() {
    revokeTelemetryConsent(); // removes key; state stays absent ('undecided') in storage
    setDismissed(true); // hide banner for this session
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-banner-title"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
      data-testid="discover-consent-banner"
    >
      <div className="rounded-lg border border-border bg-card shadow-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="consent-banner-title" className="text-sm text-muted-foreground leading-snug">
          We collect anonymous usage data on this page (no personal information,
          no property search content) to improve the Discover experience.
          You can change this preference at any time.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDecline}
            aria-label="Decline anonymous usage data collection"
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={handleAccept}
            aria-label="Accept anonymous usage data collection"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
