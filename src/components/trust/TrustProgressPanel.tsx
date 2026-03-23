import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, MapPin, Camera, Shield, ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, API_BASE_URL } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// ─── API types ────────────────────────────────────────────────────────────────

type DimensionType = 'IDENTITY' | 'LOCATION' | 'PHOTOS' | 'AUTHORITY';
type BadgeState = 'AVAILABLE' | 'EARNED' | 'PENDING' | 'EXPIRED' | 'SUSPENDED' | 'FAILED';

interface TrustProgressBadgeDto {
  dimensionType: DimensionType;
  badgeState: BadgeState;
  grantedAt: string | null;
  autoGranted: boolean | null;
  rejectionReason: string | null;
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
  FAILED: {
    label: 'Failed',
    className: 'text-red-600 border-red-400 bg-red-50',
  },
};

const FALLBACK_STATE: StateDisplay = { label: '', className: 'text-muted-foreground border-muted' };

// ─── PhotoUploadButton ────────────────────────────────────────────────────────

interface PhotoUploadButtonProps {
  listingId: string;
  onSuccess: () => void;
}

function PhotoUploadButton({ listingId, onSuccess }: PhotoUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  function handleButtonClick() {
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;

      if (!token) {
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Please log in again to upload photos.',
        });
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
      };

      const response = await fetch(
        `${API_BASE_URL}/api/listings/${listingId}/trust/photos/verify`,
        {
          method: 'POST',
          headers,
          body: formData,
        },
      );

      if (response.status === 409) {
        toast({
          title: 'Already submitted',
          description: 'Your photo is already submitted for review.',
        });
        return;
      }

      if (response.status === 422) {
        toast({
          variant: 'destructive',
          title: 'Photo rejected',
          description: 'This photo was flagged as a stock image. Please upload an original photo.',
        });
        return;
      }

      if (!response.ok) {
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: 'Upload failed. Please try again.',
        });
        return;
      }

      toast({
        title: 'Photo submitted',
        description: 'Photo submitted for review.',
      });
      onSuccess();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'Upload failed. Please try again.',
      });
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-hidden="true"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={isUploading}
        onClick={handleButtonClick}
      >
        {isUploading ? 'Uploading...' : 'Upload Live Photo'}
      </Button>
    </>
  );
}

// ─── Badge row ────────────────────────────────────────────────────────────────

interface BadgeRowProps {
  badge: TrustProgressBadgeDto;
  listingId?: string;
  onPhotoSubmitted?: () => void;
}

function BadgeRow({ badge, listingId, onPhotoSubmitted }: BadgeRowProps) {
  const { label: dimensionLabel, Icon } = DIMENSION_META[badge.dimensionType] ?? FALLBACK_DIMENSION;
  const { label: stateLabel, className: stateClassName } = STATE_DISPLAY[badge.badgeState] ?? FALLBACK_STATE;
  // CTA only applies to AVAILABLE badges — PENDING means verification is already in progress.
  const showCta = badge.badgeState === 'AVAILABLE';

  const isPhotosAvailable =
    showCta &&
    badge.dimensionType === 'PHOTOS' &&
    listingId !== undefined &&
    onPhotoSubmitted !== undefined;

  const ctaText =
    showCta && !isPhotosAvailable
      ? badge.autoGranted === true
        ? 'Auto-granted'
        : 'Verification coming soon'
      : null;

  const showRejectionReason =
    badge.badgeState === 'AVAILABLE' && badge.rejectionReason;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <span className="text-sm flex-1">{dimensionLabel}</span>
        <Badge variant="outline" className={stateClassName}>
          {stateLabel}
        </Badge>
        {isPhotosAvailable && (
          <PhotoUploadButton listingId={listingId} onSuccess={onPhotoSubmitted} />
        )}
        {ctaText && (
          <span className="text-xs text-muted-foreground">{ctaText}</span>
        )}
      </div>
      {showRejectionReason && (
        <p className="text-xs text-amber-700 pl-7">
          Rejected: {badge.rejectionReason}
        </p>
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
          <BadgeRow
            key={badge.dimensionType}
            badge={badge}
            listingId={badge.dimensionType === 'PHOTOS' ? listingId : undefined}
            onPhotoSubmitted={badge.dimensionType === 'PHOTOS' ? () => refetch() : undefined}
          />
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
            <BadgeRow
              key={badge.dimensionType}
              badge={badge}
              listingId={badge.dimensionType === 'PHOTOS' ? listingId : undefined}
              onPhotoSubmitted={badge.dimensionType === 'PHOTOS' ? () => refetch() : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
