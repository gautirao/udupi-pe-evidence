import { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrustProgressPanel } from '@/components/trust/TrustProgressPanel';
import type { ListingResponse } from '@/hooks/useBrokerListings';

interface DismissalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface TrustBannerDependencies {
  storage?: DismissalStorage;
  scrollToTrustProgress?: () => void;
}

function browserStorage(): DismissalStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function dismissalKey(listingId: string): string {
  return `trust-banner-dismissed-${listingId}`;
}

function wasDismissed(storage: DismissalStorage | undefined, listingId: string): boolean {
  try {
    return storage?.getItem(dismissalKey(listingId)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Keeps browser-storage and scrolling side effects out of the visual component.
 * Tests can inject a tiny in-memory storage adapter instead of mocking globals.
 */
export function useTrustBanner(
  listingId: string | undefined,
  hasAvailableBadge: boolean,
  dependencies: TrustBannerDependencies = {},
) {
  const storage = dependencies.storage ?? browserStorage();
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const isDismissed =
    listingId != null &&
    (dismissedId === listingId || wasDismissed(storage, listingId));

  const dismiss = () => {
    if (!listingId) {
      return;
    }

    try {
      storage?.setItem(dismissalKey(listingId), 'true');
    } catch {
      // Storage can be unavailable or full. Local state still hides the banner.
    }

    setDismissedId(listingId);
  };

  const viewProgress = () => {
    if (dependencies.scrollToTrustProgress) {
      dependencies.scrollToTrustProgress();
      return;
    }

    document
      .getElementById('trust-progress-section')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  return {
    showBanner: Boolean(listingId && hasAvailableBadge && !isDismissed),
    dismiss,
    viewProgress,
  };
}

interface TrustVerificationBannerProps {
  onDismiss: () => void;
  onViewProgress: () => void;
}

export function TrustVerificationBanner({
  onDismiss,
  onViewProgress,
}: TrustVerificationBannerProps) {
  return (
    <Alert className="mb-6 border-amber-300 bg-amber-50">
      <ShieldAlert className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          Complete your trust verification to rank higher in buyer searches.{' '}
          <button
            type="button"
            onClick={onViewProgress}
            className="underline font-medium text-amber-800 hover:text-amber-900"
          >
            View trust progress
          </button>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-4 flex-shrink-0 text-amber-600 hover:text-amber-800"
          aria-label="Dismiss trust verification banner"
        >
          <X className="h-4 w-4" />
        </button>
      </AlertDescription>
    </Alert>
  );
}

interface TrustProgressSectionProps {
  listing: Pick<ListingResponse, 'id' | 'title' | 'displayId'>;
}

export function TrustProgressSection({ listing }: TrustProgressSectionProps) {
  return (
    <Card id="trust-progress-section" className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">
          Trust Progress — {listing.title ?? listing.displayId ?? 'Your listing'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TrustProgressPanel listingId={listing.id} variant="full" />
      </CardContent>
    </Card>
  );
}
