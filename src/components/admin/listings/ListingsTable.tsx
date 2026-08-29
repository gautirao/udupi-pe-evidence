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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';
import {
  formatDisplayId,
  getQualityBucket,
  isPubliclyVisible,
  needsAttention,
  type QualityBucket,
} from '@/lib/listingInventory';
import {
  PROPERTY_TYPE_LABELS,
  propertyTypeColors,
  qualityDotColors,
  statusBadgeStyles,
} from '@/lib/listingBadgeStyles';
import type { AdminListingRow } from '@/hooks/useAdminData';
import { AlertTriangle, CheckCircle2, ExternalLink, Image as ImageIcon, MapPin, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className={cn('border-0 font-medium', statusBadgeStyles[status] ?? 'bg-gray-500/10 text-gray-600')}
    >
      {status.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

function VisibilityBadge({ listing }: { listing: AdminListingRow }) {
  return isPubliclyVisible(listing) ? (
    <Badge variant="outline" className="gap-1 border-0 bg-green-500/10 font-medium text-green-700">
      <CheckCircle2 className="h-3 w-3" />
      Public
    </Badge>
  ) : (
    <Badge variant="outline" className="border-0 bg-muted font-medium text-muted-foreground">
      Hidden
    </Badge>
  );
}

function QualityIndicator({ score }: { score: number | null | undefined }) {
  const bucket: QualityBucket = getQualityBucket(score);
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', qualityDotColors[bucket])} aria-hidden="true" />
      {score != null ? score : <span className="text-muted-foreground">Unscored</span>}
    </div>
  );
}

interface ListingsTableProps {
  pageItems: AdminListingRow[];
  selectedListings: Map<string, AdminListingRow>;
  allOnPageSelected: boolean;
  toggleSelect: (listing: AdminListingRow) => void;
  toggleSelectAll: () => void;
  openEditor: (id: string, section?: 'details' | 'activity') => void;
  onArchiveRequested: (listing: AdminListingRow) => void;
}

export function ListingsTable({
  pageItems,
  selectedListings,
  allOnPageSelected,
  toggleSelect,
  toggleSelectAll,
  openEditor,
  onArchiveRequested,
}: ListingsTableProps) {
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={allOnPageSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all on this page"
              />
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide">Listing</TableHead>
            <TableHead className="hidden xl:table-cell text-xs font-medium uppercase tracking-wide">
              Source
            </TableHead>
            <TableHead className="hidden lg:table-cell text-xs font-medium uppercase tracking-wide">
              Type
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide">Locality</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide">Price</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide">Lifecycle</TableHead>
            <TableHead className="hidden md:table-cell text-xs font-medium uppercase tracking-wide">
              Quality
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide">Visibility</TableHead>
            <TableHead className="hidden md:table-cell text-xs font-medium uppercase tracking-wide">
              Updated
            </TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems.map((listing) => {
            const images = Array.isArray(listing.raw_posts?.images)
              ? (listing.raw_posts?.images as Array<{ url?: string }>)
              : [];
            const firstImage = images[0]?.url;
            const flagged = needsAttention(listing);

            return (
              <TableRow key={listing.id} className={cn('group', !listing.is_valid && 'opacity-70')}>
                <TableCell className="py-3">
                  <Checkbox
                    checked={selectedListings.has(listing.id)}
                    onCheckedChange={() => toggleSelect(listing)}
                    aria-label={`Select ${formatDisplayId(listing.listing_number)}`}
                  />
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex items-center gap-3 min-w-[220px]">
                    <div className="w-11 h-11 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-border">
                      {firstImage ? (
                        <img src={firstImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium leading-snug truncate max-w-[200px]">
                        {listing.title || 'Untitled listing'}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">{formatDisplayId(listing.listing_number)}</span>
                        {flagged && (
                          <span
                            className="inline-flex items-center gap-0.5 text-amber-600"
                            title="Needs attention"
                          >
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            <span className="sr-only">Needs attention</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden xl:table-cell py-3 text-sm text-muted-foreground capitalize">
                  {listing.seller_type || '—'}
                </TableCell>
                <TableCell className="hidden lg:table-cell py-3">
                  <Badge
                    variant="outline"
                    className={cn('border-0 font-medium', propertyTypeColors[listing.property_type] ?? propertyTypeColors.other)}
                  >
                    {PROPERTY_TYPE_LABELS[listing.property_type] ?? listing.property_type}
                  </Badge>
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex items-center gap-1 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate max-w-[140px]">
                      {listing.locality || <span className="text-muted-foreground">Unknown</span>}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-sm font-medium">
                  {listing.price ? formatPrice(listing.price, listing.price_unit) : '—'}
                </TableCell>
                <TableCell className="py-3">
                  <StatusBadge status={listing.status} />
                </TableCell>
                <TableCell className="hidden md:table-cell py-3">
                  <QualityIndicator score={listing.quality_score} />
                </TableCell>
                <TableCell className="py-3">
                  <VisibilityBadge listing={listing} />
                </TableCell>
                <TableCell className="hidden md:table-cell py-3 text-sm text-muted-foreground">
                  {formatRelativeDate(listing.updated_at)}
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEditor(listing.id)}>
                      Open
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="More actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/listing/${listing.id}`} target="_blank" rel="noopener noreferrer">
                            {isPubliclyVisible(listing) ? 'Preview public listing' : 'Preview (draft)'}
                            <ExternalLink className="h-3.5 w-3.5 ml-auto" />
                          </Link>
                        </DropdownMenuItem>
                        {listing.latitude != null && listing.longitude != null ? (
                          <DropdownMenuItem asChild>
                            <a
                              href={`https://www.openstreetmap.org/?mlat=${listing.latitude}&mlon=${listing.longitude}#map=17/${listing.latitude}/${listing.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View on map
                            </a>
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem disabled>View on map (no coordinates)</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openEditor(listing.id, 'activity')}>
                          View activity
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {listing.status !== 'ARCHIVED' ? (
                          <DropdownMenuItem onClick={() => onArchiveRequested(listing)}>
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => openEditor(listing.id)}>
                            Restore…
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
