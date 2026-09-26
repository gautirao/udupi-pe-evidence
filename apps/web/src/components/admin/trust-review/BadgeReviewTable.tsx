import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { formatRelativeDate } from '@/lib/formatters';
import { DIMENSION_TYPE_LABELS, SELLER_TYPE_LABELS, type PendingTrustReview, type ReviewActionState } from './trustReviewTypes';

export interface BadgeReviewView {
  reviews: PendingTrustReview[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Combined busy/approving state — semantic, never a raw mutation object. */
  action: ReviewActionState;
}

export interface BadgeReviewCommands {
  review: {
    approve: (dimensionId: string) => void;
    openReject: (review: PendingTrustReview) => void;
  };
  queue: {
    retry: () => void;
  };
}

interface BadgeReviewTableProps {
  view: BadgeReviewView;
  commands: BadgeReviewCommands;
}

/**
 * Extracted from TrustReviewQueue.tsx (issue #2663) — the badge-submission
 * review table (loading / error / empty / success states unchanged).
 */
export function BadgeReviewTable({ view, commands }: BadgeReviewTableProps) {
  const { reviews, isLoading, isError, error, action } = view;
  const { busy, approving } = action;
  const { review: reviewCommands, queue } = commands;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <p className="text-destructive font-medium mb-1">Failed to load submissions</p>
          <p className="text-sm text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Button variant="outline" onClick={queue.retry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (reviews.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
          No pending badge submissions
        </CardContent>
      </Card>
    );
  }

  return (
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
                    disabled={busy}
                    onClick={() => reviewCommands.approve(review.dimensionId)}
                    aria-label={`Approve ${DIMENSION_TYPE_LABELS[review.dimensionType]} badge`}
                  >
                    {approving ? (
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
                    disabled={busy}
                    onClick={() => reviewCommands.openReject(review)}
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
  );
}
