import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { Loader2, Lock, Check, MapPin, FileText, ImageIcon, Send, X, Link } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ImageUploader } from '@/components/dealer/ImageUploader';
import { PriceField } from '@/components/dealer/PriceField';
import { AddressPicker } from '@/components/dealer/AddressPicker';
import { PoiManager } from '@/components/poi/PoiManager';
import { StepIndicator } from '@/components/dealer/StepIndicator';
import { ApiError } from '@/lib/api';

const VIDEO_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|instagram\.com\/(reel|p)\/)[^\s]+/;

function extractYouTubeId(url: string): string | null {
  const shortMatch = url.match(/youtu\.be\/([^?&\s]+)/);
  if (shortMatch) return shortMatch[1];
  const longMatch = url.match(/[?&]v=([^&\s]+)/);
  return longMatch ? longMatch[1] : null;
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(reel|p)\//.test(url);
}

const PROPERTY_TYPES = [
  { value: 'land', label: 'Land' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'commercial', label: 'Commercial' },
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

const LOCKED_STATUSES = ['PENDING_REVIEW', 'LIVE'];
const SUBMITTABLE_STATUSES = ['DRAFT', 'REJECTED'];

const WIZARD_STEPS = ['Describe', 'Add Photos', 'Pin Location', 'Review & Submit'];

export default function EditListing() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: listing, isLoading: listingLoading, isError } = useGetListing(id ?? '');
  const updateListing = useUpdateListing(id ?? '');
  const submitListing = useSubmitListing(id);

  // Step routing: read initial step from ?step= query param (1-based, default 1).
  // Guard against non-numeric values (e.g. ?step=abc → NaN) and clamp to [1, 4].
  const stepParam = searchParams.get('step');
  const initialStep = stepParam ? (Math.max(1, Math.min(4, parseInt(stepParam, 10) || 1))) : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  // When true: after saving a step, return to step 4 instead of advancing sequentially
  const [cameFromReview, setCameFromReview] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [locality, setLocality] = useState('');
  const [landArea, setLandArea] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState('');
  // Tracks whether image uploader has >= 3 images (drives step 2 completion + submit gate)
  const [canSubmitImages, setCanSubmitImages] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoUrlError, setVideoUrlError] = useState('');

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
    setVideoUrl(listing.videoUrl ?? '');
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

  // Step 1 is complete when property type and a valid price are set
  const step1Complete = listing.propertyType !== '' && (listing.price ?? 0) > 0;
  // Step 2 is complete when >= 3 images have been uploaded (tracked by canSubmitImages)
  const step2Complete = canSubmitImages;
  // Step 3 is complete when address has been confirmed
  const step3Complete = listing.addressConfirmed === true;

  const steps = [
    { label: WIZARD_STEPS[0], isComplete: step1Complete },
    { label: WIZARD_STEPS[1], isComplete: step2Complete },
    { label: WIZARD_STEPS[2], isComplete: step3Complete },
    { label: WIZARD_STEPS[3], isComplete: false }, // terminal step
  ];

  const handleStepClick = (n: number) => {
    // Allow: step 1 always, any completed step, or any step before current
    if (n === 1 || steps[n - 1]?.isComplete || n < currentStep) {
      setCurrentStep(n);
    }
  };

  // Saves step 1 form fields, then advances to step 2 (or back to review)
  const handleStep1Save = (e: React.FormEvent) => {
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
          if (cameFromReview) {
            setCameFromReview(false);
            setCurrentStep(4);
          } else {
            setCurrentStep(2);
          }
        },
      },
    );
  };

  const handleVideoUrlChange = (value: string) => {
    setVideoUrl(value);
    setVideoUrlError('');
    if (value && !VIDEO_URL_REGEX.test(value)) {
      setVideoUrlError('Please enter a YouTube or Instagram Reel URL');
    }
  };

  const handleStep2Continue = () => {
    // Persist video URL before advancing; hook-level onError toast handles failures
    updateListing.mutate(
      { videoUrl: videoUrl.trim() || null, applyVideoUrl: true },
      {
        onSuccess: () => {
          if (cameFromReview) {
            setCameFromReview(false);
            setCurrentStep(4);
          } else {
            setCurrentStep(3);
          }
        },
      },
    );
  };

  const handleStep3Continue = () => {
    setCameFromReview(false);
    setCurrentStep(4);
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

        {/* Step indicator */}
        <StepIndicator
          steps={steps}
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />

        {/* ── Step 1: Describe ── */}
        <div data-testid="step-1-panel" style={{ display: currentStep === 1 ? 'block' : 'none' }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Listing Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStep1Save} className="space-y-6">
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

                {/* Step 1 action */}
                <div className="flex justify-end pt-4 border-t mt-2">
                  <Button type="submit" disabled={updateListing.isPending}>
                    {updateListing.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save & Continue
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── Step 2: Add Photos ── */}
        <div data-testid="step-2-panel" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
          {isSubmittable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Listing Images
                </CardTitle>
                <CardDescription>Minimum 3 images required to submit for review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* ImageUploader is always mounted (CSS visibility) so upload state is preserved */}
                <ImageUploader listingId={id!} onCanSubmitChange={setCanSubmitImages} />

                {/* Video link section */}
                <Separator className="my-4" />
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Property Video (optional)</Label>
                  <p className="text-xs text-muted-foreground">YouTube or Instagram Reel link</p>
                  <Input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => handleVideoUrlChange(e.target.value)}
                  />
                  {videoUrlError && (
                    <p className="text-sm text-destructive">{videoUrlError}</p>
                  )}
                  {/* YouTube thumbnail preview */}
                  {videoUrl && !videoUrlError && extractYouTubeId(videoUrl) && (
                    <img
                      src={`https://img.youtube.com/vi/${extractYouTubeId(videoUrl)}/mqdefault.jpg`}
                      alt="Video thumbnail"
                      className="rounded-md w-48 h-auto border"
                    />
                  )}
                  {/* Instagram confirmed state */}
                  {videoUrl && !videoUrlError && isInstagramUrl(videoUrl) && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Link className="h-4 w-4" />
                      <span>instagram.com</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button type="button" onClick={handleStep2Continue}>
                    Save & Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Step 3: Pin Location ── */}
        <div data-testid="step-3-panel" style={{ display: currentStep === 3 ? 'block' : 'none' }}>
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
              <CardContent className="space-y-4">
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
                <div className="flex justify-end pt-4 border-t">
                  <Button type="button" onClick={handleStep3Continue}>
                    Save & Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Step 4: Review & Submit ── */}
        <div data-testid="step-4-panel" style={{ display: currentStep === 4 ? 'block' : 'none' }}>
          {/* Review summary */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Review Your Listing</CardTitle>
              <CardDescription>
                Check the details below before submitting for admin review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Property Details row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Property Details</p>
                  <p className="text-sm text-muted-foreground">
                    {listing.propertyType || '—'} · {listing.title || '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {listing.price != null
                      ? `₹${listing.price.toLocaleString('en-IN')}`
                      : '—'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setCameFromReview(true); setCurrentStep(1); }}
                >
                  Edit
                </Button>
              </div>

              <div className="border-t" />

              {/* Photos row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Photos</p>
                  <p className="text-sm text-muted-foreground">
                    {canSubmitImages ? 'Minimum 3 photos uploaded' : 'Fewer than 3 photos — add more before submitting'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setCameFromReview(true); setCurrentStep(2); }}
                >
                  Edit
                </Button>
              </div>

              <div className="border-t" />

              {/* Location row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Location</p>
                  <p className="text-sm text-muted-foreground">
                    {listing.addressConfirmed
                      ? `Confirmed · ${listing.locality || 'pin set'}`
                      : 'Not yet confirmed'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setCameFromReview(true); setCurrentStep(3); }}
                >
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* POIs — shown when address is confirmed */}
          {listing.addressConfirmed ? (
            <PoiManager listingId={id!} />
          ) : (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Nearby Points of Interest</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <MapPin className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Location not yet confirmed</p>
                  <p className="text-sm text-muted-foreground">
                    Confirm your listing's address in step 3 to enable POI suggestions.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit for Review (isSubmittable only) */}
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
                        : 'Confirm your pin location in step 3',
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
                        : <X className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
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

      </div>
    </AppLayout>
  );
}
