import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, MapPin, Camera, Shield, ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

// ─── API types ────────────────────────────────────────────────────────────────

type DimensionType = 'IDENTITY' | 'LOCATION' | 'PHOTOS' | 'AUTHORITY';
type BadgeState = 'AVAILABLE' | 'EARNED' | 'PENDING' | 'EXPIRED' | 'SUSPENDED';

interface TrustProgressBadgeDto {
  dimensionType: DimensionType;
  badgeState: BadgeState;
  grantedAt: string | null;
  autoGranted: boolean | null;
}

interface TrustProgressResponse {
  badges: TrustProgressBadgeDto[];
  // dimensionType of first AVAILABLE badge, or null when all are terminal.
  // Unused in RE-154 (display-only); RE-155 will wire CTA routing.
  cta: DimensionType | null;
}

// ─── Component props ──────────────────────────────────────────────────────────

export interface TrustProgressPanelProps {
  listingId: string;
  variant: 'full' | 'compact';
}

// ─── Display maps ─────────────────────────────────────────────────────────────

const DIMENSION_META: Record<DimensionType, { label: string; Icon: React.ElementType }> = {
  IDENTITY: { label: 'Identity', Icon: User },
  LOCATION: { label: 'Location', Icon: MapPin },
  PHOTOS: { label: 'Photos', Icon: Camera },
  AUTHORITY: { label: 'Authority', Icon: Shield },
};

const FALLBACK_DIMENSION = { label: '', Icon: Shield } as const;

interface StateDisplay {
  label: string;
  className: string;
}

const STATE_DISPLAY: Record<BadgeState, StateDisplay> = {
  EARNED: {
    label: 'Verified',
    className: 'text-green-600 border-green-500',
  },
  AVAILABLE: {
    label: 'Not Started',
    className: 'text-muted-foreground border-muted',
  },
  PENDING: {
    label: 'Pending Review',
    className: 'text-amber-700 border-amber-400 bg-amber-50',
  },
  SUSPENDED: {
    label: 'Verification Removed',
    className: 'text-muted-foreground border-muted',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'text-muted-foreground border-muted',
  },
};

const FALLBACK_STATE: StateDisplay = { label: '', className: 'text-muted-foreground border-muted' };

// ─── Badge row ────────────────────────────────────────────────────────────────

interface BadgeRowProps {
  badge: TrustProgressBadgeDto;
}

function BadgeRow({ badge }: BadgeRowProps) {
  const { label: dimensionLabel, Icon } = DIMENSION_META[badge.dimensionType] ?? FALLBACK_DIMENSION;
  const { label: stateLabel, className: stateClassName } = STATE_DISPLAY[badge.badgeState] ?? FALLBACK_STATE;
  // CTA only applies to AVAILABLE badges — PENDING means verification is already in progress.
  const showCta = badge.badgeState === 'AVAILABLE';

  const ctaText =
    showCta
      ? badge.autoGranted === true
        ? 'Auto-granted'
        : 'Verification coming soon'
      : null;

  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <span className="text-sm flex-1">{dimensionLabel}</span>
      <Badge variant="outline" className={stateClassName}>
        {stateLabel}
      </Badge>
      {ctaText && (
        <span className="text-xs text-muted-foreground">{ctaText}</span>
      )}
    </div>
  );
}

// ─── Compact pill ─────────────────────────────────────────────────────────────

interface CompactPillProps {
  earned: number;
  total: number;
  hasPending: boolean;
}

function CompactPill({ earned, total, hasPending }: CompactPillProps) {
  const allEarned = earned === total && total > 0;
  const pillClassName =
    allEarned
      ? 'text-green-600'
      : hasPending
        ? 'text-amber-700'
        : 'text-muted-foreground';

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${pillClassName}`}>
      {earned}/{total} badges verified
    </span>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div aria-busy="true" role="status" aria-label="Loading trust progress" className="space-y-2">
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrustProgressPanel({ listingId, variant }: TrustProgressPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['trust-progress', listingId],
    queryFn: () => api.get<TrustProgressResponse>(`/api/listings/${listingId}/trust-progress`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Could not load trust progress.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { badges } = data;
  const earnedCount = badges.filter((b) => b.badgeState === 'EARNED').length;
  const totalCount = badges.length;
  const hasPending = badges.some((b) => b.badgeState === 'PENDING');

  if (variant === 'full') {
    return (
      <div className="space-y-3">
        {badges.map((badge) => (
          <BadgeRow key={badge.dimensionType} badge={badge} />
        ))}
      </div>
    );
  }

  // compact variant
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <CompactPill earned={earnedCount} total={totalCount} hasPending={hasPending} />
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={isExpanded}
          aria-controls={`trust-details-${listingId}`}
        >
          {isExpanded ? (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
              Hide details
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              View details
            </>
          )}
        </button>
      </div>
      {isExpanded && (
        <div id={`trust-details-${listingId}`} className="space-y-3 pt-1">
          {badges.map((badge) => (
            <BadgeRow key={badge.dimensionType} badge={badge} />
          ))}
        </div>
      )}
    </div>
  );
}
