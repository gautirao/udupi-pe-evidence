import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useDuplicateListings,
  usePotentialOriginals,
  useDismissDuplicate,
  useDeleteDuplicate,
  useMergeDuplicate,
  DuplicateListing,
  groupDuplicates,
} from '@/hooks/useDuplicateManagement';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';
import {
  Copy,
  Loader2,
  MapPin,
  Phone,
  Trash2,
  Check,
  GitMerge,
  Image as ImageIcon,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PropertyType } from '@/hooks/usePropertyListings';

const propertyTypeColors: Record<PropertyType, string> = {
  land: 'bg-green-500/10 text-green-600',
  agricultural_land: 'bg-lime-500/10 text-lime-700',
  house: 'bg-orange-500/10 text-orange-600',
  villa: 'bg-pink-500/10 text-pink-600',
  residential_plot: 'bg-emerald-500/10 text-emerald-700',
  apartment: 'bg-violet-500/10 text-violet-600',
  commercial: 'bg-blue-500/10 text-blue-600',
  commercial_building: 'bg-blue-600/10 text-blue-700',
  warehouse: 'bg-amber-500/10 text-amber-700',
  commercial_land: 'bg-teal-500/10 text-teal-700',
  other: 'bg-gray-500/10 text-gray-600',
};

export default function Duplicates() {
  const { data: duplicates = [], isLoading } = useDuplicateListings();
  const dismissDuplicate = useDismissDuplicate();
  const deleteDuplicate = useDeleteDuplicate();
  const mergeDuplicate = useMergeDuplicate();

  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateListing | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DuplicateListing | null>(null);
  const [viewingListing, setViewingListing] = useState<DuplicateListing | null>(null);

  const { data: potentialOriginals = [], isLoading: loadingOriginals } = usePotentialOriginals(selectedDuplicate);

  const handleDismiss = async (listing: DuplicateListing) => {
    await dismissDuplicate.mutateAsync(listing.id);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteDuplicate.mutateAsync(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const handleMerge = async (originalId: string) => {
    if (!selectedDuplicate) return;
    await mergeDuplicate.mutateAsync({
      duplicateId: selectedDuplicate.id,
      originalId,
    });
    setSelectedDuplicate(null);
  };

  const duplicateGroups = groupDuplicates(duplicates);

  // Stats
  const stats = {
    total: duplicates.length,
    groups: duplicateGroups.length,
    byPhone: duplicates.filter((d) => d.contact_phone).length,
    byLocation: duplicates.filter((d) => !d.contact_phone && d.locality).length,
  };

  return (
    <AppLayout>
      <div className="container py-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Copy className="h-6 w-6 text-primary" />
              Duplicate Management
            </h1>
            <p className="text-muted-foreground">Review and resolve duplicate listings</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-sm text-muted-foreground">Total Duplicates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-600">{stats.groups}</div>
              <p className="text-sm text-muted-foreground">Duplicate Groups</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{stats.byPhone}</div>
              <p className="text-sm text-muted-foreground">By Phone Match</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-600">{stats.byLocation}</div>
              <p className="text-sm text-muted-foreground">By Location Match</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : duplicates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Check className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No Duplicates Found</h3>
              <p className="text-muted-foreground">All listings appear to be unique.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Image</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Locality</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicates.map((listing) => {
                  const images = listing.raw_posts?.images || [];
                  const firstImage = images[0]?.url;

                  return (
                    <TableRow key={listing.id}>
                      <TableCell>
                        {firstImage ? (
                          <div className="relative w-12 h-12 rounded overflow-hidden bg-muted">
                            <img
                              src={firstImage}
                              alt="Property"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={propertyTypeColors[listing.property_type]}>
                          {listing.property_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {listing.locality || <span className="text-muted-foreground">Unknown</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {listing.price ? formatPrice(listing.price, listing.price_unit) : '—'}
                      </TableCell>
                      <TableCell>
                        {listing.contact_phone ? (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {listing.contact_phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatRelativeDate(listing.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View Details"
                            onClick={() => setViewingListing(listing)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Find & Merge with Original"
                            onClick={() => setSelectedDuplicate(listing)}
                          >
                            <GitMerge className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Not a Duplicate"
                            onClick={() => handleDismiss(listing)}
                            disabled={dismissDuplicate.isPending}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete Duplicate"
                            onClick={() => setDeleteConfirm(listing)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* View Listing Dialog */}
        <Dialog open={!!viewingListing} onOpenChange={(open) => !open && setViewingListing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Listing Details</DialogTitle>
              <DialogDescription>
                Review the duplicate listing content
              </DialogDescription>
            </DialogHeader>

            {viewingListing && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Type:</span>{' '}
                    <Badge className={propertyTypeColors[viewingListing.property_type]}>
                      {viewingListing.property_type}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Price:</span>{' '}
                    {viewingListing.price ? formatPrice(viewingListing.price, viewingListing.price_unit) : '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Locality:</span>{' '}
                    {viewingListing.locality || '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone:</span>{' '}
                    {viewingListing.contact_phone || '—'}
                  </div>
                  {viewingListing.bedrooms && (
                    <div>
                      <span className="text-muted-foreground">Bedrooms:</span>{' '}
                      {viewingListing.bedrooms}
                    </div>
                  )}
                  {viewingListing.bathrooms && (
                    <div>
                      <span className="text-muted-foreground">Bathrooms:</span>{' '}
                      {viewingListing.bathrooms}
                    </div>
                  )}
                </div>

                {viewingListing.description && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                      {viewingListing.description}
                    </p>
                  </div>
                )}

                {viewingListing.raw_posts?.content && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">Original Post</h4>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {viewingListing.raw_posts.content}
                    </p>
                  </div>
                )}

                {viewingListing.raw_posts?.images && viewingListing.raw_posts.images.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Images</h4>
                    <div className="flex gap-2 overflow-x-auto">
                      {viewingListing.raw_posts.images.slice(0, 4).map((img, idx) => (
                        <img
                          key={idx}
                          src={img.url}
                          alt={`Property ${idx + 1}`}
                          className="w-24 h-24 object-cover rounded"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingListing(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Merge Dialog */}
        <Dialog open={!!selectedDuplicate} onOpenChange={(open) => !open && setSelectedDuplicate(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Merge Duplicate</DialogTitle>
              <DialogDescription>
                Select the original listing to merge this duplicate with
              </DialogDescription>
            </DialogHeader>

            {selectedDuplicate && (
              <div className="space-y-4">
                {/* Duplicate Info */}
                <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Duplicate Listing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-muted-foreground">Type:</span>{' '}
                        {selectedDuplicate.property_type}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Locality:</span>{' '}
                        {selectedDuplicate.locality || '—'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Price:</span>{' '}
                        {selectedDuplicate.price ? formatPrice(selectedDuplicate.price, selectedDuplicate.price_unit) : '—'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Potential Originals */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Potential Original Listings</h4>
                  {loadingOriginals ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : potentialOriginals.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No matching original listings found.
                        <br />
                        <span className="text-sm">Consider dismissing this as not a duplicate.</span>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {potentialOriginals.map((original) => (
                        <Card
                          key={original.id}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-accent',
                            original.is_valid && 'border-green-200 dark:border-green-800'
                          )}
                          onClick={() => handleMerge(original.id)}
                        >
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div className="grid grid-cols-4 gap-4 text-sm flex-1">
                                <div>
                                  <Badge className={propertyTypeColors[original.property_type]}>
                                    {original.property_type}
                                  </Badge>
                                </div>
                                <div>{original.locality || '—'}</div>
                                <div>
                                  {original.price ? formatPrice(original.price, original.price_unit) : '—'}
                                </div>
                                <div className="text-muted-foreground">
                                  {formatRelativeDate(original.created_at)}
                                </div>
                              </div>
                              <Button size="sm" variant="outline" className="ml-4">
                                <GitMerge className="h-4 w-4 mr-1" />
                                Merge
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedDuplicate(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Duplicate?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this listing. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteDuplicate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
