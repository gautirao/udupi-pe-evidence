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
import { DOCUMENT_TYPE_LABELS, type PendingIdentityEvidence, type ReviewActionState } from './trustReviewTypes';

export interface IdentityReviewView {
  items: PendingIdentityEvidence[];
  isLoading: boolean;
  isError: boolean;
  /** Combined busy/approving state — semantic, never a raw mutation object. */
  action: ReviewActionState;
}

export interface IdentityReviewCommands {
  review: {
    approve: (evidenceId: string) => void;
    openReject: (item: PendingIdentityEvidence) => void;
  };
  queue: {
    retry: () => void;
  };
}

interface IdentityReviewTableProps {
  view: IdentityReviewView;
  commands: IdentityReviewCommands;
}

/**
 * Extracted from TrustReviewQueue.tsx (issue #2663) — the identity-evidence
 * review table (loading / error / empty / success states unchanged).
 * `data-testid={identity-evidence-${evidenceId}}` is preserved on rows only
 * here — the badge table never had it.
 */
export function IdentityReviewTable({ view, commands }: IdentityReviewTableProps) {
  const { items, isLoading, isError, action } = view;
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
          <p className="text-destructive font-medium mb-1">Failed to load identity evidence</p>
          <Button variant="outline" onClick={queue.retry} className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
          No pending identity evidence
        </CardContent>
      </Card>
    );
  }

  return (
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
          {items.map((item) => (
            <TableRow key={item.evidenceId} data-testid={`identity-evidence-${item.evidenceId}`}>
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
                {item.documentUrl ? (
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
                    disabled={busy}
                    onClick={() => reviewCommands.approve(item.evidenceId)}
                    aria-label="Approve identity evidence"
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
                    onClick={() => reviewCommands.openReject(item)}
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
  );
}
