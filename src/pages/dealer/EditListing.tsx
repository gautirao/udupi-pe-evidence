import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGetListing, useUpdateListing, useSubmitListing } from '@/hooks/useDealerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImageUploader } from '@/components/dealer/ImageUploader';
import { AddressPicker } from '@/components/dealer/AddressPicker';
import { ApiError } from '@/lib/api';

const PROPERTY_TYPES = [
  { value: 'land', label: 'Land' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'commercial', label: 'Commercial' },
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

const LOCKED_STATUSES = ['PENDING_REVIEW', 'LIVE'];
const SUBMITTABLE_STATUSES = ['DRAFT', 'REJECTED'];

export default function EditListing() {
  const { id } = useParams<{ id: string }>();
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: listing, isLoading: listingLoading, isError } = useGetListing(id ?? '');
  const updateListing = useUpdateListing(id ?? '');
  const submitListing = useSubmitListing(id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [locality, setLocality] = useState('');
  const [landArea, setLandArea] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState('');

  // Pre-populate form once listing loads
  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title ?? '');
    setDescription(listing.description ?? '');
    setPrice(listing.price != null ? String(listing.price) : '');
    setPropertyType((listing.propertyType as PropertyType) ?? '');
    setLocality(listing.locality ?? '');
    setLandArea(listing.landArea != null ? String(listing.landArea) : '');
    setBedrooms(listing.bedrooms != null ? String(listing.bedrooms) : '');
    setBuiltArea(listing.builtArea != null ? String(listing.builtArea) : '');
  }, [listing]);

  // Auth guard
  const role = userRole as string | null;
  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }
  if (role !== 'dealer' && role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (listingLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !listing) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-8 px-4">
          <Alert variant="destructive">
            <AlertDescription>
              Listing not found or could not be loaded.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/dealer/listings')}>
              Back to Listings
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Locked state: listing cannot be edited
  if (LOCKED_STATUSES.includes(listing.status)) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-8 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Edit Listing</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  This listing is locked and cannot be edited. Listings with status{' '}
                  <strong>{listing.status}</strong> are read-only.
                </AlertDescription>
              </Alert>
              <div className="mt-4">
                <Button variant="outline" onClick={() => navigate('/dealer/listings')}>
                  Back to Listings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const priceNum = parseFloat(price);
    if (price !== '' && (isNaN(priceNum) || priceNum <= 0)) {
      toast({
        title: 'Invalid price',
        description: 'Please enter a valid price greater than 0.',
        variant: 'destructive',
      });
      return;
    }

    const landAreaNum = landArea !== '' ? parseFloat(landArea) : undefined;
    const bedroomsNum = bedrooms !== '' ? parseInt(bedrooms, 10) : undefined;
    const builtAreaNum = builtArea !== '' ? parseFloat(builtArea) : undefined;

    updateListing.mutate(
      {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        price: price !== '' ? priceNum : undefined,
        propertyType: propertyType || undefined,
        locality: locality.trim() || undefined,
        landArea: landAreaNum,
        bedrooms: bedroomsNum,
        builtArea: builtAreaNum,
      },
      {
        onSuccess: () => {
          toast({ title: 'Listing updated', description: 'Your listing has been saved.' });
          navigate('/dealer/listings');
        },
      },
    );
  };

  const handleSubmitForReview = () => {
    submitListing.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Listing submitted for review' });
        navigate('/dealer/listings');
      },
      onError: (error: Error) => {
        const apiErr = error as ApiError;
        const body = apiErr.body as Record<string, unknown> | undefined;
        const message =
          (body?.message as string | undefined) ??
          (body?.error as string | undefined) ??
          error.message;
        toast({
          title: 'Submit failed',
          description: message,
          variant: 'destructive',
        });
      },
    });
  };

  const showLandArea = propertyType === 'land';
  const showBedrooms = propertyType === 'apartment' || propertyType === 'house';
  const showBuiltArea = propertyType === 'apartment' || propertyType === 'house';
  const isSubmittable = SUBMITTABLE_STATUSES.includes(listing.status);

  return (
    <AppLayout>
      <div className="container max-w-2xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Edit Listing</CardTitle>
            <CardDescription>
              Update the details for your listing. Status:{' '}
              <strong>{listing.status}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Property Type */}
              <div className="space-y-2">
                <Label htmlFor="propertyType">Property Type</Label>
                <Select
                  value={propertyType}
                  onValueChange={(v) => setPropertyType(v as PropertyType)}
                >
                  <SelectTrigger id="propertyType">
                    <SelectValue placeholder="Select property type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>
                        {pt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. 3 BHK Apartment in Manipal"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price">Price (INR)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  placeholder="e.g. 2500000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>

              {/* Locality */}
              <div className="space-y-2">
                <Label htmlFor="locality">Locality</Label>
                <Input
                  id="locality"
                  placeholder="e.g. Manipal, Udupi"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the property..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Land Area — land only */}
              {showLandArea && (
                <div className="space-y-2">
                  <Label htmlFor="landArea">Land Area (sq ft)</Label>
                  <Input
                    id="landArea"
                    type="number"
                    min="0"
                    placeholder="e.g. 2400"
                    value={landArea}
                    onChange={(e) => setLandArea(e.target.value)}
                  />
                </div>
              )}

              {/* Bedrooms — apartment / house */}
              {showBedrooms && (
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">Bedrooms</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    min="1"
                    max="20"
                    placeholder="e.g. 3"
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                  />
                </div>
              )}

              {/* Built Area — apartment / house */}
              {showBuiltArea && (
                <div className="space-y-2">
                  <Label htmlFor="builtArea">Built Area (sq ft)</Label>
                  <Input
                    id="builtArea"
                    type="number"
                    min="0"
                    placeholder="e.g. 1200"
                    value={builtArea}
                    onChange={(e) => setBuiltArea(e.target.value)}
                  />
                </div>
              )}

              {/* Section A — Images (DRAFT / REJECTED only) */}
              {isSubmittable && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Listing Images</h3>
                  <p className="text-xs text-muted-foreground">
                    Minimum 3 images required to submit for review.
                  </p>
                  <ImageUploader listingId={id!} />
                </div>
              )}

              {/* Section B — Address confirmation (DRAFT / REJECTED only) */}
              {isSubmittable && (
                <>
                  {!listing.addressConfirmed && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Confirm Location</h3>
                      <p className="text-xs text-muted-foreground">
                        Drag the pin to your listing's exact location, then click Confirm.
                      </p>
                      <AddressPicker
                        initialLatitude={listing.latitude}
                        initialLongitude={listing.longitude}
                        initialLocality={listing.locality}
                        onConfirm={(addr) => {
                          updateListing.mutate({
                            latitude: addr.lat,
                            longitude: addr.lng,
                            addressConfirmed: true,
                          });
                        }}
                      />
                    </div>
                  )}
                  {listing.addressConfirmed && (
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <Check className="h-4 w-4" />
                      Location confirmed
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/dealer/listings')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateListing.isPending}>
                  {updateListing.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>

              {/* Section C — Submit for Review (DRAFT / REJECTED only) */}
              {isSubmittable && (
                <>
                  <Separator className="my-2" />
                  <div className="space-y-1">
                    <Button
                      type="button"
                      className="w-full"
                      variant="default"
                      disabled={submitListing.isPending || !listing.addressConfirmed}
                      onClick={handleSubmitForReview}
                    >
                      {submitListing.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Submit for Review
                    </Button>
                    {!listing.addressConfirmed && (
                      <p className="text-xs text-muted-foreground text-center">
                        Confirm your location before submitting
                      </p>
                    )}
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
