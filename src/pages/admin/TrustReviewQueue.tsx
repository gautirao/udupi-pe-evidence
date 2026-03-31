import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRelativeDate } from '@/lib/formatters';

// ─── Identity evidence types ─────────────────────────────────────────────────

interface PendingIdentityEvidence {
  evidenceId: string;
  profileId: string;
  listingId: string;
  legalName: string;
  phoneNumber: string;
  documentType: string;
  documentUrl: string;
  submittedAt: string;
  listingTitle: string | null;
  listingLocality: string | null;
}

interface IdentityPendingResponse {
  items: PendingIdentityEvidence[];
  page: number;
  totalPages: number;
  totalElements: number;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  AADHAAR: 'Aadhaar',
  PAN: 'PAN',
  VOTER_ID: 'Voter ID',
  PASSPORT: 'Passport',
  DRIVING_LICENSE: 'Driving License',
};

// ─── Badge review types ──────────────────────────────────────────────────────

interface PendingTrustReview {
  dimensionId: string;
  listingId: string;
  dimensionType: 'PHOTOS' | 'AUTHORITY' | 'IDENTITY' | 'LOCATION';
  badgeState: 'PENDING';
  submittedAt: string;
  verificationAssetUrl: string | null;
  listingTitle: string | null;
  listingLocality: string | null;
  listingSellerType: 'owner' | 'broker';
}

interface ApproveRejectResponse {
  message: string;
}

const DIMENSION_TYPE_LABELS: Record<PendingTrustReview['dimensionType'], string> = {
  PHOTOS: 'Photos',
  AUTHORITY: 'Authority',
  IDENTITY: 'Identity',
  LOCATION: 'Location',
};

const SELLER_TYPE_LABELS: Record<PendingTrustReview['listingSellerType'], string> = {
  owner: 'Owner',
  broker: 'Broker',
};

const BADGE_QUERY_KEY = ['admin', 'trust', 'pending-reviews'] as const;
const IDENTITY_QUERY_KEY = ['admin', 'trust', 'identity', 'pending'] as const;

export default function TrustReviewQueue() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rejectTarget, setRejectTarget] = useState<PendingTrustReview | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [identityRejectTarget, setIdentityRejectTarget] = useState<PendingIdentityEvidence | null>(null);
  const [identityRejectReason, setIdentityRejectReason] = useState('');

  // ─── Badge reviews ─────────────────────────────────────────────────────────

  const {
    data: reviews = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PendingTrustReview[]>({
    queryKey: [...BADGE_QUERY_KEY],
    queryFn: () => api.get<PendingTrustReview[]>('/api/admin/trust/pending-reviews'),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (dimensionId: string) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/${dimensionId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...BADGE_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [...IDENTITY_QUERY_KEY] });
      toast({ title: 'Badge approved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ dimensionId, reason }: { dimensionId: string; reason: string }) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/${dimensionId}/reject`, reason.trim() ? { reason: reason.trim() } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...BADGE_QUERY_KEY] });
      setRejectTarget(null);
      setRejectReason('');
      toast({ title: 'Badge submission rejected' });
    },
    onError: (err: Error) => {
      setRejectTarget(null);
      setRejectReason('');
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  // ─── Identity evidence reviews ─────────────────────────────────────────────

  const {
    data: identityData,
    isLoading: identityLoading,
    isError: identityError,
    refetch: identityRefetch,
  } = useQuery<IdentityPendingResponse>({
    queryKey: [...IDENTITY_QUERY_KEY],
    queryFn: () => api.get<IdentityPendingResponse>('/api/admin/trust/identity/pending?size=50'),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const identityItems = identityData?.items ?? [];

  const approveIdentityMutation = useMutation({
    mutationFn: (evidenceId: string) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/identity/${evidenceId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...IDENTITY_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [...BADGE_QUERY_KEY] });
      toast({ title: 'Identity evidence approved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const rejectIdentityMutation = useMutation({
    mutationFn: ({ evidenceId, reason }: { evidenceId: string; reason: string }) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/identity/${evidenceId}/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...IDENTITY_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [...BADGE_QUERY_KEY] });
      setIdentityRejectTarget(null);
      setIdentityRejectReason('');
      toast({ title: 'Identity evidence rejected' });
    },
    onError: (err: Error) => {
      setIdentityRejectTarget(null);
      setIdentityRejectReason('');
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  const isBusy = approveMutation.isPending || rejectMutation.isPending
    || approveIdentityMutation.isPending || rejectIdentityMutation.isPending;

  return (
    <AppLayout>
      <div className="container py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Trust Review Queue
            </h1>
            <p className="text-muted-foreground">
              Review pending trust badge submissions
            </p>
          </div>
        </div>

        <Tabs defaultValue="badges" className="space-y-4">
          <TabsList>
            <TabsTrigger value="badges">
              Badges ({reviews.length})
            </TabsTrigger>
            <TabsTrigger value="identity">
              Identity Evidence ({identityItems.length})
            </TabsTrigger>
          </TabsList>

          {/* ─── Badge reviews tab ──────────────────────────────────────────── */}
          <TabsContent value="badges">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : isError ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                  <p className="text-destructive font-medium mb-1">Failed to load submissions</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {error instanceof Error ? error.message : 'An unexpected error occurred'}
                  </p>
                  <Button variant="outline" onClick={() => refetch()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : reviews.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                  No pending badge submissions
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dimension Type</TableHead>
                      <TableHead>Listing</TableHead>
                      <TableHead>Seller Type</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.map((review) => (
                      <TableRow key={review.dimensionId}>
                        <TableCell>
                          <Badge variant="outline">
                            {DIMENSION_TYPE_LABELS[review.dimensionType]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="font-medium truncate">
                            {review.listingTitle || 'Untitled'}
                          </p>
                          {review.listingLocality && (
                            <p className="text-xs text-muted-foreground truncate">
                              {review.listingLocality}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {SELLER_TYPE_LABELS[review.listingSellerType]}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatRelativeDate(review.submittedAt)}
                        </TableCell>
                        <TableCell>
                          {review.verificationAssetUrl ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs h-7 px-2"
                              asChild
                            >
                              <a
                                href={review.verificationAssetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View Asset
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-200 hover:bg-green-50"
                              disabled={isBusy}
                              onClick={() => approveMutation.mutate(review.dimensionId)}
                              aria-label={`Approve ${DIMENSION_TYPE_LABELS[review.dimensionType]} badge`}
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              disabled={isBusy}
                              onClick={() => setRejectTarget(review)}
                              aria-label={`Reject ${DIMENSION_TYPE_LABELS[review.dimensionType]} badge`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* ─── Identity evidence tab ──────────────────────────────────────── */}
          <TabsContent value="identity">
            {identityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : identityError ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                  <p className="text-destructive font-medium mb-1">Failed to load identity evidence</p>
                  <Button variant="outline" onClick={() => identityRefetch()} className="mt-4">
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : identityItems.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                  No pending identity evidence
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Legal Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Listing</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {identityItems.map((item) => (
                      <TableRow key={item.evidenceId}>
                        <TableCell className="font-medium">
                          {item.legalName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.phoneNumber}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {DOCUMENT_TYPE_LABELS[item.documentType] ?? item.documentType}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="font-medium truncate">
                            {item.listingTitle || 'Untitled'}
                          </p>
                          {item.listingLocality && (
                            <p className="text-xs text-muted-foreground truncate">
                              {item.listingLocality}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatRelativeDate(item.submittedAt)}
                        </TableCell>
                        <TableCell>
                          {item.documentUrl && !item.documentUrl.startsWith('storage-disabled://') ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs h-7 px-2"
                              asChild
                            >
                              <a
                                href={item.documentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-200 hover:bg-green-50"
                              disabled={isBusy}
                              onClick={() => approveIdentityMutation.mutate(item.evidenceId)}
                              aria-label="Approve identity evidence"
                            >
                              {approveIdentityMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              disabled={isBusy}
                              onClick={() => setIdentityRejectTarget(item)}
                              aria-label="Reject identity evidence"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Badge reject dialog */}
        <Dialog
          open={!!rejectTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRejectTarget(null);
              setRejectReason('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Submission</DialogTitle>
              <DialogDescription>
                This will return the badge to Available state. You may optionally add a reason
                visible to the broker.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label htmlFor="reject-reason" className="text-sm mb-1.5 block">
                Reason <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="reject-reason"
                placeholder="e.g. Document appears to be expired"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={rejectMutation.isPending}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={rejectMutation.isPending}
                onClick={() => {
                  if (rejectTarget) rejectMutation.mutate({ dimensionId: rejectTarget.dimensionId, reason: rejectReason });
                }}
              >
                {rejectMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Identity evidence reject dialog */}
        <Dialog
          open={!!identityRejectTarget}
          onOpenChange={(open) => {
            if (!open) {
              setIdentityRejectTarget(null);
              setIdentityRejectReason('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Identity Evidence</DialogTitle>
              <DialogDescription>
                This will reset the identity badge to Available state and allow the user to resubmit.
                A reason is required.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label htmlFor="identity-reject-reason" className="text-sm mb-1.5 block">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="identity-reject-reason"
                placeholder="e.g. Document is blurry or name does not match"
                value={identityRejectReason}
                onChange={(e) => setIdentityRejectReason(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={rejectIdentityMutation.isPending}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setIdentityRejectTarget(null); setIdentityRejectReason(''); }}
                disabled={rejectIdentityMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={rejectIdentityMutation.isPending || !identityRejectReason.trim()}
                onClick={() => {
                  if (identityRejectTarget) {
                    rejectIdentityMutation.mutate({
                      evidenceId: identityRejectTarget.evidenceId,
                      reason: identityRejectReason,
                    });
                  }
                }}
              >
                {rejectIdentityMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
