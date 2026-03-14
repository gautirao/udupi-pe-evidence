import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useSuspectedDuplicates,
  useConfirmDuplicate,
  useDismissDuplicateCandidate,
  useUndoDuplicate,
  DuplicateCandidate,
} from '@/hooks/useSuspectedDuplicates';
import { Copy } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreBadgeClass(score: number): string {
  const pct = score * 100;
  if (pct >= 70) return 'bg-green-500/10 text-green-700';
  if (pct >= 50) return 'bg-amber-500/10 text-amber-700';
  return 'bg-red-500/10 text-red-600';
}

const STATUS_STYLES: Record<DuplicateCandidate['status'], string> = {
  PENDING: 'bg-blue-500/10 text-blue-700',
  CONFIRMED: 'bg-red-500/10 text-red-600',
  DISMISSED: 'bg-gray-500/10 text-gray-600',
};

function ListingLink({ id }: { id: string }) {
  return (
    <a
      href={`/listings/${id}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-primary hover:underline"
    >
      {id.slice(0, 8)}
    </a>
  );
}

// ─── Skeleton rows ───────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-8 w-36" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Actions cell ─────────────────────────────────────────────────────────

interface ActionsCellProps {
  candidate: DuplicateCandidate;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
  onUndo: (id: string) => void;
  isLoading: boolean;
}

function ActionsCell({
  candidate,
  onConfirm,
  onDismiss,
  onUndo,
  isLoading,
}: ActionsCellProps) {
  if (candidate.status === 'PENDING') {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={isLoading}
          onClick={() => onConfirm(candidate.id)}
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={() => onDismiss(candidate.id)}
        >
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isLoading}
      onClick={() => onUndo(candidate.id)}
    >
      Undo
    </Button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuspectedDuplicates() {
  const { data, isLoading, isError, page, setPage, refetch } = useSuspectedDuplicates();
  const confirm = useConfirmDuplicate();
  const dismiss = useDismissDuplicateCandidate();
  const undo = useUndoDuplicate();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleConfirm = (id: string) => {
    const ok = window.confirm(
      'Mark this listing as a confirmed duplicate? The newer listing will be archived.',
    );
    if (ok) {
      setPendingId(id);
      confirm.mutate(id, { onSettled: () => setPendingId(null) });
    }
  };

  const handleDismiss = (id: string) => {
    setPendingId(id);
    dismiss.mutate(id, { onSettled: () => setPendingId(null) });
  };

  const handleUndo = (id: string) => {
    setPendingId(id);
    undo.mutate(id, { onSettled: () => setPendingId(null) });
  };

  const totalElements = data?.page.totalElements ?? 0;
  const totalPages = data?.page.totalPages ?? 1;
  const rows = data?.content ?? [];

  return (
    <AppLayout>
      <div className="container py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Copy className="h-6 w-6 text-primary" />
              Suspected Duplicates
            </h1>
            {!isLoading && !isError && (
              <p className="text-muted-foreground">
                {totalElements} pair{totalElements !== 1 ? 's' : ''} pending review
              </p>
            )}
          </div>
        </div>

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <p>Failed to load duplicate candidates.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* Table */}
        {!isError && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing A</TableHead>
                  <TableHead>Listing B</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonRows />
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                      No duplicate candidates found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell>
                        <ListingLink id={candidate.listingIdA} />
                      </TableCell>
                      <TableCell>
                        <ListingLink id={candidate.listingIdB} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {candidate.distanceMeters != null
                          ? `${candidate.distanceMeters.toFixed(1)} m`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={scoreBadgeClass(candidate.similarityScore)}>
                          {(candidate.similarityScore * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[candidate.status]}>
                          {candidate.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ActionsCell
                          candidate={candidate}
                          onConfirm={handleConfirm}
                          onDismiss={handleDismiss}
                          onUndo={handleUndo}
                          isLoading={pendingId === candidate.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !isError && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
