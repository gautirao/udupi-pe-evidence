import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, MapPin, Camera, Shield, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { api, API_BASE_URL } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useIdentityVerification } from '@/hooks/useIdentityVerification';
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

// ─── Identity OTP flow ────────────────────────────────────────────────────────

type OtpStep = 'idle' | 'sending' | 'awaiting_code' | 'verifying';

interface IdentityVerifyButtonProps {
  listingId: string;
}

function IdentityVerifyButton({ listingId }: IdentityVerifyButtonProps) {
  const { toast } = useToast();
  const { requestOtp, verifyOtp } = useIdentityVerification(listingId);
  const [step, setStep] = useState<OtpStep>('idle');
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  async function handleRequestOtp() {
    setStep('sending');
    try {
      await requestOtp.mutateAsync();
      setCode('');
      setOtpError(null);
      setStep('awaiting_code');
    } catch (err) {
      setStep('idle');
      if (err instanceof ApiError && err.status === 503) {
        toast({ variant: 'destructive', title: 'Could not send SMS', description: 'Try again.' });
      } else if (err instanceof ApiError && err.status === 429) {
        toast({ variant: 'destructive', title: 'Too many attempts', description: 'Try again in 1 hour.' });
      } else {
        toast({ variant: 'destructive', title: 'OTP send failed', description: 'Please try again.' });
      }
    }
  }

  async function handleVerify() {
    if (code.length !== 6) return;
    setStep('verifying');
    try {
      await verifyOtp.mutateAsync(code);
      setStep('idle');
      setCode('');
      toast({ title: 'Identity verified', description: 'Your identity badge is now earned.' });
    } catch (err) {
      setStep('awaiting_code');
      if (err instanceof ApiError && err.status === 429) {
        setOtpError('Too many attempts. Try again in 1 hour.');
      } else {
        setOtpError('Incorrect code. Please try again.');
      }
    }
  }

  function handleModalClose(open: boolean) {
    if (!open) {
      setStep('idle');
      setCode('');
      setOtpError(null);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={step === 'sending'}
        onClick={handleRequestOtp}
      >
        {step === 'sending' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Sending…
          </>
        ) : (
          'Verify your identity'
        )}
      </Button>

      <Dialog open={step === 'awaiting_code' || step === 'verifying'} onOpenChange={handleModalClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify your identity</DialogTitle>
            <DialogDescription>
              Enter the 6-digit code sent to your registered phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              disabled={step === 'verifying'}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {otpError && (
              <p className="text-sm text-destructive">{otpError}</p>
            )}
            <div className="flex gap-2 w-full justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={step === 'verifying'}
                onClick={() => handleModalClose(false)}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={step === 'verifying'}
                onClick={handleRequestOtp}
              >
                Resend code
              </Button>
              <Button
                size="sm"
                disabled={code.length !== 6 || step === 'verifying'}
                onClick={handleVerify}
              >
                {step === 'verifying' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Verifying…
                  </>
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

  const isIdentityAvailable =
    showCta &&
    badge.dimensionType === 'IDENTITY' &&
    listingId !== undefined;

  const ctaText =
    showCta && !isPhotosAvailable && !isIdentityAvailable
      ? badge.autoGranted === true
        ? 'Auto-granted'
        : 'Verification coming soon'
      : null;

  const earnedAutoText =
    badge.badgeState === 'EARNED' && badge.autoGranted === true
      ? 'Automatically confirmed \u2014 you are the property owner'
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
        {isIdentityAvailable && (
          <IdentityVerifyButton listingId={listingId} />
        )}
        {ctaText && (
          <span className="text-xs text-muted-foreground">{ctaText}</span>
        )}
        {earnedAutoText && (
          <span className="text-xs text-green-700">{earnedAutoText}</span>
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
            listingId={badge.dimensionType === 'PHOTOS' || badge.dimensionType === 'IDENTITY' ? listingId : undefined}
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
              listingId={badge.dimensionType === 'PHOTOS' || badge.dimensionType === 'IDENTITY' ? listingId : undefined}
              onPhotoSubmitted={badge.dimensionType === 'PHOTOS' ? () => refetch() : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
