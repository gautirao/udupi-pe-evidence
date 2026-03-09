import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGetListing, useUpdateListing, useSubmitListing } from '@/hooks/useDealerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, Check, MapPin, FileText, ImageIcon, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImageUploader } from '@/components/dealer/ImageUploader';
import { PriceField } from '@/components/dealer/PriceField';
import { AddressPicker } from '@/components/dealer/AddressPicker';
import { PoiManager } from '@/components/poi/PoiManager';
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
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [locality, setLocality] = useState('');
  const [landArea, setLandArea] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState('');
  const [canSubmitImages, setCanSubmitImages] = useState(false);

  // Pre-populate form once listing loads
  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title ?? '');
    setDescription(listing.description ?? '');
    setPriceRupees(listing.price ?? null);
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

    const landAreaNum = landArea !== '' ? parseFloat(landArea) : undefined;
    const bedroomsNum = bedrooms !== '' ? parseInt(bedrooms, 10) : undefined;
    const builtAreaNum = builtArea !== '' ? parseFloat(builtArea) : undefined;

    updateListing.mutate(
      {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        price: priceRupees ?? undefined,
        propertyType: propertyType || undefined,
        locality: locality.trim() || undefined,
        landArea: landAreaNum,
        bedrooms: bedroomsNum,
        builtArea: builtAreaNum,
      },
      {
        onSuccess: () => {
          toast({ title: 'Listing updated', description: 'Your listing has been saved.' });
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

  const statusBadgeVariant = listing.status === 'REJECTED'
    ? 'destructive'
    : listing.status === 'DRAFT'
    ? 'secondary'
    : 'outline';

  const requiredFieldsComplete = priceRupees != null && priceRupees > 0 && !!propertyType && !!locality;
  const allConditionsMet = canSubmitImages && !!listing.addressConfirmed && requiredFieldsComplete;

  return (
    <AppLayout>
      <div className="container max-w-2xl py-8 px-4 space-y-6">

        {/* Page header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">Edit Listing</h1>
            <Badge variant={statusBadgeVariant}>{listing.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Complete all sections below before submitting for review.
          </p>
        </div>

        {/* Card 1: Listing Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Listing Details
            </CardTitle>
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
              <PriceField initialRupees={priceRupees} onChange={setPriceRupees} required />

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

              {/* Save button */}
              <div className="flex justify-end pt-4 border-t mt-2">
                <Button type="submit" variant="outline" disabled={updateListing.isPending}>
                  {updateListing.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Card 2: Listing Images (isSubmittable only) */}
        {isSubmittable && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Listing Images
              </CardTitle>
              <CardDescription>Minimum 3 images required to submit for review.</CardDescription>
            </CardHeader>
            <CardContent>
              <ImageUploader listingId={id!} onCanSubmitChange={setCanSubmitImages} />
            </CardContent>
          </Card>
        )}

        {/* Card 3: Confirm Location (isSubmittable only) */}
        {isSubmittable && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Confirm Location
              </CardTitle>
              <CardDescription>
                Search for your listing's address, drag the pin to the exact spot, then confirm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddressPicker
                initialLatitude={listing.latitude}
                initialLongitude={listing.longitude}
                initialLocality={listing.locality}
                initialConfirmed={listing.addressConfirmed}
                onConfirm={(addr) => {
                  if (!updateListing.isPending) {
                    updateListing.mutate({ latitude: addr.lat, longitude: addr.lng, addressConfirmed: true });
                  }
                }}
                onUnconfirm={() => {
                  if (!updateListing.isPending) {
                    updateListing.mutate({ addressConfirmed: false });
                  }
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Card 4: POIs */}
        {listing.addressConfirmed ? (
          <PoiManager listingId={id!} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Nearby Points of Interest</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Location not yet confirmed</p>
                <p className="text-sm text-muted-foreground">
                  Confirm your listing's address above to enable POI suggestions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Card 5: Submit for Review (isSubmittable only, absolute last) */}
        {isSubmittable && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-5 w-5 text-primary" />
                Ready to Submit?
              </CardTitle>
              <CardDescription>
                All requirements must be met before submitting for admin review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  {
                    label: 'Listing photos',
                    met: canSubmitImages,
                    detail: canSubmitImages
                      ? 'Minimum 3 photos uploaded'
                      : 'At least 3 photos required',
                  },
                  {
                    label: 'Location confirmed',
                    met: !!listing.addressConfirmed,
                    detail: listing.addressConfirmed
                      ? 'Pin position confirmed on map'
                      : 'Confirm your pin location above',
                  },
                  {
                    label: 'Required fields',
                    met: requiredFieldsComplete,
                    detail: requiredFieldsComplete
                      ? 'All required fields filled in'
                      : 'Price, property type, and locality required',
                  },
                ].map(({ label, met, detail }) => (
                  <div key={label} className="flex items-start gap-3">
                    {met
                      ? <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      : <X className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t">
                <Button
                  type="button"
                  className="w-full"
                  disabled={submitListing.isPending || updateListing.isPending || !allConditionsMet}
                  onClick={handleSubmitForReview}
                >
                  {submitListing.isPending
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                    : 'Submit for Review'}
                </Button>
                {listing.status === 'REJECTED' && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Previously rejected — review the feedback before resubmitting.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </AppLayout>
  );
}
