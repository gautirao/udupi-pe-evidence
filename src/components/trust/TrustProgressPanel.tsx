import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, MapPin, Camera, Shield, ChevronRight, ChevronDown, Loader2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

// ─── Identity evidence form ──────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: 'AADHAAR', label: 'Aadhaar Card' },
  { value: 'PAN', label: 'PAN Card' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENSE', label: 'Driving License' },
] as const;

interface IdentityEvidenceFormProps {
  listingId: string;
  badgeState: BadgeState;
  rejectionReason?: string | null;
}

function IdentityEvidenceForm({ listingId, badgeState, rejectionReason }: IdentityEvidenceFormProps) {
  const { toast } = useToast();
  const { submitEvidence } = useIdentityVerification(listingId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function resetForm() {
    setLegalName('');
    setPhoneNumber('');
    setDocumentType('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleModalClose(open: boolean) {
    if (!open) {
      setIsOpen(false);
      resetForm();
    }
  }

  async function handleSubmit() {
    if (!legalName.trim() || !phoneNumber.trim() || !documentType || !selectedFile) return;

    try {
      await submitEvidence.mutateAsync({
        legalName: legalName.trim(),
        phoneNumber: phoneNumber.trim(),
        documentType,
        file: selectedFile,
      });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Evidence submitted', description: 'Under review -- usually 1-2 business days.' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast({ variant: 'destructive', title: 'Already submitted', description: String((err.body as { error?: string })?.error ?? 'Evidence already submitted.') });
      } else if (err instanceof ApiError && err.status === 413) {
        toast({ variant: 'destructive', title: 'File too large', description: 'File size must not exceed 10 MB.' });
      } else {
        toast({ variant: 'destructive', title: 'Submission failed', description: err instanceof Error ? err.message : 'Please try again.' });
      }
    }
  }

  const isSubmitting = submitEvidence.isPending;
  const formValid = legalName.trim().length > 0 && phoneNumber.trim().length > 0 && documentType.length > 0 && selectedFile !== null;

  // PENDING state — show status text
  if (badgeState === 'PENDING') {
    return (
      <span className="text-xs text-amber-700">
        Under review -- usually 1-2 business days
      </span>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(true)}
      >
        {rejectionReason ? 'Resubmit' : 'Verify your identity'}
      </Button>

      <Dialog open={isOpen} onOpenChange={handleModalClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify your identity</DialogTitle>
            <DialogDescription>
              Upload a government ID document for verification. This is reviewed by our team, usually within 1-2 business days.
            </DialogDescription>
          </DialogHeader>

          {rejectionReason && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm text-amber-800">
                <span className="font-medium">Previous submission rejected:</span> {rejectionReason}
              </p>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ie-legal-name">Legal name</Label>
              <Input
                id="ie-legal-name"
                placeholder="Full name as on document"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                disabled={isSubmitting}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ie-phone">Phone number</Label>
              <Input
                id="ie-phone"
                placeholder="+91 98765 43210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isSubmitting}
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={documentType} onValueChange={setDocumentType} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ie-file">Document image or PDF</Label>
              <Input
                id="ie-file"
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">Max 10 MB. JPEG, PNG, or PDF.</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleModalClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              disabled={!formValid || isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Submit for review
                </>
              )}
            </Button>
          </DialogFooter>
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

  const isIdentityActionable =
    (badge.badgeState === 'AVAILABLE' || badge.badgeState === 'PENDING') &&
    badge.dimensionType === 'IDENTITY' &&
    listingId !== undefined;

  const ctaText =
    showCta && !isPhotosAvailable && !isIdentityActionable
      ? badge.autoGranted === true
        ? 'Auto-granted'
        : 'Verification coming soon'
      : null;

  const earnedAutoText =
    badge.badgeState === 'EARNED' && badge.autoGranted === true
      ? 'Automatically confirmed \u2014 you are the property owner'
      : null;

  const showRejectionReason =
    badge.badgeState === 'AVAILABLE' && badge.rejectionReason && badge.dimensionType !== 'IDENTITY';

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
        {isIdentityActionable && (
          <IdentityEvidenceForm
            listingId={listingId}
            badgeState={badge.badgeState}
            rejectionReason={badge.rejectionReason}
          />
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
