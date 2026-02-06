import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminListings, useGeocodeMissing } from '@/hooks/useAdminData';
import { useUpdateListing, PropertyListing, PropertyType } from '@/hooks/usePropertyListings';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';
import {
  Home,
  Loader2,
  Pencil,
  MapPin,
  CheckCircle2,
  XCircle,
  Filter,
  Image as ImageIcon,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const propertyTypeColors: Record<PropertyType, string> = {
  land: 'bg-green-500/10 text-green-600',
  house: 'bg-orange-500/10 text-orange-600',
  apartment: 'bg-violet-500/10 text-violet-600',
  commercial: 'bg-blue-500/10 text-blue-600',
  other: 'bg-gray-500/10 text-gray-600',
};

const confidenceColor = (score: number | null) => {
  if (!score) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
};

export default function Listings() {
  const { data: listings = [], isLoading } = useAdminListings(200);
  const updateListing = useUpdateListing();
  const { geocodeMissing, isProcessing: isGeocoding, logs: geocodeLogs, progress: geocodeProgress, reset: resetGeocode } = useGeocodeMissing();

  const [editingListing, setEditingListing] = useState<PropertyListing | null>(null);
  const [showGeocodeDialog, setShowGeocodeDialog] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterValidity, setFilterValidity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [editForm, setEditForm] = useState({
    locality: '',
    latitude: '',
    longitude: '',
    price: '',
    property_type: '' as PropertyType,
    is_valid: true,
  });

  const handleEdit = (listing: PropertyListing) => {
    setEditForm({
      locality: listing.locality || '',
      latitude: listing.latitude?.toString() || '',
      longitude: listing.longitude?.toString() || '',
      price: listing.price?.toString() || '',
      property_type: listing.property_type,
      is_valid: listing.is_valid,
    });
    setEditingListing(listing);
  };

  const handleSave = async () => {
    if (!editingListing) return;

    await updateListing.mutateAsync({
      id: editingListing.id,
      updates: {
        locality: editForm.locality || null,
        latitude: editForm.latitude ? parseFloat(editForm.latitude) : null,
        longitude: editForm.longitude ? parseFloat(editForm.longitude) : null,
        price: editForm.price ? parseFloat(editForm.price) : null,
        property_type: editForm.property_type,
        is_valid: editForm.is_valid,
      },
    });

    setEditingListing(null);
  };

  const handleToggleValid = async (listing: PropertyListing) => {
    await updateListing.mutateAsync({
      id: listing.id,
      updates: { is_valid: !listing.is_valid },
    });
  };

  // Filter listings
  const filteredListings = listings.filter((listing) => {
    if (filterType !== 'all' && listing.property_type !== filterType) return false;
    if (filterValidity === 'valid' && !listing.is_valid) return false;
    if (filterValidity === 'invalid' && listing.is_valid) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        listing.locality?.toLowerCase().includes(query) ||
        listing.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: listings.length,
    valid: listings.filter((l) => l.is_valid).length,
    withCoords: listings.filter((l) => l.latitude && l.longitude).length,
    lowConfidence: listings.filter((l) => (l.confidence_score || 0) < 50).length,
    missingCoords: listings.filter((l) => l.locality && (!l.latitude || !l.longitude)).length,
  };

  const handleStartGeocode = () => {
    setShowGeocodeDialog(true);
    resetGeocode();
    geocodeMissing(20);
  };

  return (
    <AppLayout>
      <div className="container py-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Home className="h-6 w-6 text-primary" />
              Listings Review
            </h1>
            <p className="text-muted-foreground">Review and correct extracted listings</p>
          </div>
          {stats.missingCoords > 0 && (
            <Button onClick={handleStartGeocode} disabled={isGeocoding}>
              {isGeocoding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Globe className="h-4 w-4 mr-2" />
              Geocode Missing ({stats.missingCoords})
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-sm text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.valid}</div>
              <p className="text-sm text-muted-foreground">Valid</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{stats.withCoords}</div>
              <p className="text-sm text-muted-foreground">Geocoded</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{stats.lowConfidence}</div>
              <p className="text-sm text-muted-foreground">Low Confidence</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by locality..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs"
              />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Property Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                  <SelectItem value="house">House</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterValidity} onValueChange={setFilterValidity}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Validity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="valid">Valid Only</SelectItem>
                  <SelectItem value="invalid">Invalid Only</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground ml-auto">
                Showing {filteredListings.length} of {listings.length}
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Image</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Locality</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Coords</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Valid</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings.map((listing) => {
                  // Get images from joined raw_posts data
                  const rawPost = (listing as any).raw_posts;
                  const images = rawPost?.images || [];
                  const firstImage = images[0]?.url;
                  
                  return (
                  <TableRow key={listing.id} className={cn(!listing.is_valid && 'opacity-50')}>
                    <TableCell>
                      {firstImage ? (
                        <div className="relative w-12 h-12 rounded overflow-hidden bg-muted">
                          <img 
                            src={firstImage} 
                            alt="Property" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <div className="hidden absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          {images.length > 1 && (
                            <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
                              +{images.length - 1}
                            </div>
                          )}
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
                      {listing.latitude && listing.longitude ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={cn('font-medium', confidenceColor(listing.confidence_score))}>
                        {listing.confidence_score ?? 0}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={listing.is_valid}
                        onCheckedChange={() => handleToggleValid(listing)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatRelativeDate(listing.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(listing)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingListing} onOpenChange={(open) => !open && setEditingListing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Listing</DialogTitle>
              <DialogDescription>
                Correct the extracted property data
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Property Type</Label>
                <Select
                  value={editForm.property_type}
                  onValueChange={(v) => setEditForm({ ...editForm, property_type: v as PropertyType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="land">Land</SelectItem>
                    <SelectItem value="house">House</SelectItem>
                    <SelectItem value="apartment">Apartment</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Locality</Label>
                <Input
                  value={editForm.locality}
                  onChange={(e) => setEditForm({ ...editForm, locality: e.target.value })}
                  placeholder="e.g., Manipal, Udupi"
                />
              </div>

              <div className="space-y-2">
                <Label>Price (INR)</Label>
                <Input
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  placeholder="e.g., 5000000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editForm.latitude}
                    onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                    placeholder="13.3409"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editForm.longitude}
                    onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                    placeholder="74.7421"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Valid Listing</Label>
                  <p className="text-sm text-muted-foreground">Show on public map</p>
                </div>
                <Switch
                  checked={editForm.is_valid}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, is_valid: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingListing(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateListing.isPending}>
                {updateListing.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Geocode Dialog */}
        <Dialog open={showGeocodeDialog} onOpenChange={setShowGeocodeDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Geocoding Listings
              </DialogTitle>
              <DialogDescription>
                Fetching coordinates for listings with missing lat/lng
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {geocodeProgress && (
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{geocodeProgress.processed}</div>
                    <div className="text-sm text-muted-foreground">Processed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{geocodeProgress.geocoded}</div>
                    <div className="text-sm text-muted-foreground">Geocoded</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{geocodeProgress.failed}</div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                </div>
              )}

              <ScrollArea className="h-48 rounded border p-3 bg-muted/50">
                <div className="space-y-1 font-mono text-xs">
                  {geocodeLogs.length === 0 && isGeocoding && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Starting geocoding...
                    </div>
                  )}
                  {geocodeLogs.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-2',
                        log.type === 'success' && 'text-green-600',
                        log.type === 'warning' && 'text-yellow-600',
                        log.type === 'error' && 'text-red-600',
                        log.type === 'info' && 'text-muted-foreground'
                      )}
                    >
                      <span className="shrink-0">{log.type === 'success' ? '✓' : log.type === 'error' ? '✗' : log.type === 'warning' ? '⚠' : '○'}</span>
                      <span>{log.message}</span>
                      {log.details && <span className="text-muted-foreground">— {log.details}</span>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGeocodeDialog(false)}>
                {isGeocoding ? 'Close' : 'Done'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}