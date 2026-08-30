import { AlertTriangle, CheckCircle2, ImageOff, MapPinOff } from 'lucide-react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatPrice, formatRelativeDate, humanizeEnumValue } from '@/lib/formatters';
import { getReviewFlags, REVIEW_FLAG_LABELS, type ReviewFlag } from './pendingApprovalsHelpers';

interface PendingApprovalsTableProps {
  listings: ListingResponse[];
  onReview: (listing: ListingResponse, triggerRef: HTMLElement | null) => void;
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onTogglePage: (ids: string[], select: boolean) => void;
}

const FLAG_ICONS: Record<ReviewFlag, typeof AlertTriangle> = {
  missing_info: AlertTriangle,
  no_photos: ImageOff,
  location_unconfirmed: MapPinOff,
};

function StatusBadges({ listing }: { listing: ListingResponse }) {
  const flags = getReviewFlags(listing);
  if (flags.length === 0) {
    return (
      <Badge variant="outline" className="gap-1 border-evergreen/20 bg-evergreen-tint text-evergreen">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        No issues detected
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => {
        const Icon = FLAG_ICONS[flag];
        return (
          <Badge key={flag} variant="outline" className="gap-1 border-amber-200 bg-amber-100 text-amber-800">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {REVIEW_FLAG_LABELS[flag]}
          </Badge>
        );
      })}
    </div>
  );
}

export function PendingApprovalsTable({
  listings,
  onReview,
  selectedIds,
  onToggleRow,
  onTogglePage,
}: PendingApprovalsTableProps) {
  const pageIds = listings.map((listing) => listing.id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
  const allPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all listings on this page"
                checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) => onTogglePage(pageIds, checked !== false)}
              />
            </TableHead>
            <TableHead>Listing</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Locality</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing) => (
            <TableRow
              key={listing.id}
              data-testid={`pending-row-${listing.id}`}
              data-state={selectedIds.has(listing.id) ? 'selected' : undefined}
              className="cursor-pointer"
              onClick={(e) => onReview(listing, e.currentTarget)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label={`Select ${listing.title || 'this listing'} for bulk approval`}
                  data-testid={`select-row-${listing.id}`}
                  checked={selectedIds.has(listing.id)}
                  onCheckedChange={() => onToggleRow(listing.id)}
                />
              </TableCell>
              <TableCell className="max-w-[220px]">
                <div className="truncate font-medium">
                  {listing.title || listing.description?.slice(0, 60) || 'Untitled listing'}
                </div>
                {listing.displayId && (
                  <div className="text-xs text-muted-foreground">{listing.displayId}</div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{humanizeEnumValue(listing.propertyType)}</Badge>
              </TableCell>
              <TableCell>{listing.locality || '—'}</TableCell>
              <TableCell>{listing.price ? formatPrice(listing.price) : '—'}</TableCell>
              <TableCell
                className="text-sm text-muted-foreground"
                title={new Date(listing.createdAt).toLocaleString('en-IN')}
              >
                {formatRelativeDate(listing.createdAt)}
              </TableCell>
              <TableCell>
                <StatusBadges listing={listing} />
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid={`review-button-${listing.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReview(listing, e.currentTarget);
                  }}
                >
                  Review
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
