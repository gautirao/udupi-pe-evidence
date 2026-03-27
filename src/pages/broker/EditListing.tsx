import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGetListing, useUpdateListing, useSubmitListing } from '@/hooks/useBrokerListings';
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
import { Loader2, Lock, Check, MapPin, FileText, ImageIcon, Send, X, Link, AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ImageUploader } from '@/components/broker/ImageUploader';
import { useListingImages } from '@/hooks/useListingImages';
import { PriceField } from '@/components/broker/PriceField';
import { AreaField } from '@/components/broker/AreaField';
import { AddressPicker } from '@/components/broker/AddressPicker';
import { PoiManager } from '@/components/poi/PoiManager';
import { StepIndicator } from '@/components/broker/StepIndicator';
import { ApiError } from '@/lib/api';
import { formatListingId } from '@/lib/listing-id';

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
  { value: 'commercial', label: 'Commercial Shop/Office' },
  { value: 'commercial_building', label: 'Commercial Building' },
  { value: 'warehouse', label: 'Warehouse / Godown' },
  { value: 'commercial_land', label: 'Commercial Land' },
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

const COMMERCIAL_TYPES = new Set(['commercial', 'commercial_building', 'warehouse', 'commercial_land']);

const FURNISHING_OPTIONS = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi_furnished', label: 'Semi Furnished' },
  { value: 'furnished', label: 'Furnished' },
];

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
  const [landArea, setLandArea] = useState<number | null>(null);
  // Unit for land area; default 'cent' (dominant Udupi/Karnataka unit).
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  // Unit for built area; default 'sqft'.
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');
  // Inline unit-validation errors (only shown when area has a value but unit is missing)
  const [landAreaUnitError, setLandAreaUnitError] = useState('');
  const [builtAreaUnitError, setBuiltAreaUnitError] = useState('');
  // Tracks whether image uploader has >= 3 images (drives step 2 completion + submit gate)
  const [canSubmitImages, setCanSubmitImages] = useState(false);
  const [reraNumber, setReraNumber] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoUrlError, setVideoUrlError] = useState('');

  // Listing purpose
  const [listingPurpose, setListingPurpose] = useState<'sale' | 'rent'>('sale');

  // Commercial-specific fields
  const [carpetArea, setCarpetArea] = useState<number | null>(null);
  const [carpetAreaUnit, setCarpetAreaUnit] = useState('sqft');
  const [floorNumber, setFloorNumber] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [furnishingStatus, setFurnishingStatus] = useState('');
  const [washrooms, setWashrooms] = useState('');
  const [parkingCount, setParkingCount] = useState('');
  const [roadFrontageFt, setRoadFrontageFt] = useState('');
  const [commercialUsage, setCommercialUsage] = useState('');
  const [numberOfUnits, setNumberOfUnits] = useState('');

  // Rent-specific fields
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDepositMonths, setSecurityDepositMonths] = useState('');
  const [lockInMonths, setLockInMonths] = useState('');

  // Images for thumbnail strip in step 4 review
  const { images: listingImages } = useListingImages(id);

  // Pre-populate form once listing loads
  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title ?? '');
    setDescription(listing.description ?? '');
    setPriceRupees(listing.price ?? null);
    setPropertyType((listing.propertyType as PropertyType) ?? '');
    setLocality(listing.locality ?? '');
    setLandArea(listing.landArea);
    // Existing listings saved before unit support have null unit — fall back to 'cent'
    // (dominant Udupi/Karnataka unit, matches NewListing default)
    setLandAreaUnit(listing.landAreaUnit ?? 'cent');
    setBedrooms(listing.bedrooms != null ? String(listing.bedrooms) : '');
    setBuiltArea(listing.builtArea);
    setBuiltAreaUnit(listing.builtAreaUnit ?? 'sqft');
    setVideoUrl(listing.videoUrl ?? '');
    setReraNumber(listing.reraNumber ?? '');
    setListingPurpose((listing.listingPurpose as 'sale' | 'rent') ?? 'sale');
    setCarpetArea(listing.carpetArea);
    setCarpetAreaUnit(listing.carpetAreaUnit ?? 'sqft');
    setFloorNumber(listing.floorNumber != null ? String(listing.floorNumber) : '');
    setTotalFloors(listing.totalFloors != null ? String(listing.totalFloors) : '');
    setFurnishingStatus(listing.furnishingStatus ?? '');
    setWashrooms(listing.washrooms != null ? String(listing.washrooms) : '');
    setParkingCount(listing.parkingCount != null ? String(listing.parkingCount) : '');
    setRoadFrontageFt(listing.roadFrontageFt != null ? String(listing.roadFrontageFt) : '');
    setCommercialUsage(listing.commercialUsage ?? '');
    setNumberOfUnits(listing.numberOfUnits != null ? String(listing.numberOfUnits) : '');
    setMonthlyRent(listing.monthlyRent != null ? String(listing.monthlyRent) : '');
    setSecurityDepositMonths(listing.securityDepositMonths != null ? String(listing.securityDepositMonths) : '');
    setLockInMonths(listing.lockInMonths != null ? String(listing.lockInMonths) : '');
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
  if (role !== 'dealer' && role !== 'admin' && role !== 'user') {
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
            <Button variant="outline" onClick={() => navigate('/broker/listings')}>
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
                <Button variant="outline" onClick={() => navigate('/broker/listings')}>
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

  // Derived visibility flags — declared before handlers that reference them
  const isCommercialType = COMMERCIAL_TYPES.has(propertyType);
  const isRent = listingPurpose === 'rent';
  const showLandArea = propertyType === 'land' || propertyType === 'commercial_land'
    || propertyType === 'commercial_building' || propertyType === 'warehouse';
  const showBedrooms = propertyType === 'apartment' || propertyType === 'house';
  const showBuiltArea = propertyType === 'apartment' || propertyType === 'house'
    || propertyType === 'commercial_building' || propertyType === 'warehouse';

  // Saves step 1 form fields, then advances to step 2 (or back to review)
  const handleStep1Save = (e: React.FormEvent) => {
    e.preventDefault();

    const bedroomsNum = bedrooms !== '' ? parseInt(bedrooms, 10) : undefined;
    const landAreaVal = landArea != null && landArea > 0 ? landArea : undefined;
    const builtAreaVal = builtArea != null && builtArea > 0 ? builtArea : undefined;

    // Unit validation is now handled by AreaField (unit is always set via Select).
    // Clear any stale errors from before the AreaField migration.
    setLandAreaUnitError('');
    setBuiltAreaUnitError('');

    const carpetAreaVal = carpetArea != null && carpetArea > 0 ? carpetArea : undefined;
    const intOrUndef = (v: string) => { const n = parseInt(v, 10); return !isNaN(n) && n > 0 ? n : undefined; };
    const floatOrUndef = (v: string) => { const n = parseFloat(v); return !isNaN(n) && n > 0 ? n : undefined; };

    updateListing.mutate(
      {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        price: isRent ? undefined : (priceRupees ?? undefined),
        propertyType: propertyType || undefined,
        locality: locality.trim() || undefined,
        landArea: landAreaVal,
        landAreaUnit: showLandArea && landAreaVal !== undefined ? landAreaUnit : undefined,
        bedrooms: bedroomsNum,
        builtArea: builtAreaVal,
        builtAreaUnit: showBuiltArea && builtAreaVal !== undefined ? builtAreaUnit : undefined,
        reraNumber: (propertyType === 'apartment' || propertyType === 'house')
          ? (reraNumber.trim() || null)
          : undefined,
        listingPurpose,
        carpetArea: carpetAreaVal,
        carpetAreaUnit: carpetAreaVal !== undefined ? carpetAreaUnit : undefined,
        floorNumber: intOrUndef(floorNumber),
        totalFloors: intOrUndef(totalFloors),
        furnishingStatus: furnishingStatus || undefined,
        washrooms: intOrUndef(washrooms),
        parkingCount: intOrUndef(parkingCount),
        roadFrontageFt: floatOrUndef(roadFrontageFt),
        commercialUsage: commercialUsage.trim() || undefined,
        numberOfUnits: intOrUndef(numberOfUnits),
        monthlyRent: isRent ? intOrUndef(monthlyRent) : undefined,
        securityDepositMonths: isRent ? intOrUndef(securityDepositMonths) : undefined,
        lockInMonths: isRent ? intOrUndef(lockInMonths) : undefined,
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
        navigate('/broker/listings');
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

  const isSubmittable = SUBMITTABLE_STATUSES.includes(listing.status);

  const statusBadgeVariant = listing.status === 'REJECTED'
    ? 'destructive'
    : listing.status === 'DRAFT'
    ? 'secondary'
    : 'outline';

  const requiredFieldsComplete = isRent
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0 && !!propertyType && !!locality)
    : (priceRupees != null && priceRupees > 0 && !!propertyType && !!locality);
  const allConditionsMet = canSubmitImages && !!listing.addressConfirmed && requiredFieldsComplete;

  return (
    <AppLayout>
      <div className="container max-w-2xl py-8 px-4 space-y-6">

        {/* Page header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">
              {listing.status === 'REJECTED' ? 'Fix & Resubmit Listing' : 'Edit Listing'}
            </h1>
            <Badge variant={statusBadgeVariant}>{listing.status}</Badge>
            {listing.listingNumber != null && (
              <span className="text-xs text-muted-foreground font-mono">
                {formatListingId(listing.listingNumber)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Complete all sections below before submitting for review.
          </p>
        </div>

        {/* Rejection reason alert — only shown for REJECTED listings with a reason */}
        {listing.status === 'REJECTED' && listing.rejectionReason && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Rejection reason: </span>
              {listing.rejectionReason}
            </AlertDescription>
          </Alert>
        )}

        {/* Step indicator */}
        <StepIndicator
          steps={steps}
          currentStep={currentStep}
          onStepClick={handleStepClick}
          helperText="Complete each step, then submit for admin review."
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

                {/* Listing Purpose (Sale / Rent) */}
                <div className="space-y-2">
                  <Label>Listing Purpose</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={listingPurpose === 'sale' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setListingPurpose('sale')}
                    >
                      For Sale
                    </Button>
                    <Button
                      type="button"
                      variant={listingPurpose === 'rent' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setListingPurpose('rent')}
                    >
                      For Rent
                    </Button>
                  </div>
                </div>

                {/* Land Area — land, commercial_land, commercial_building, warehouse */}
                {showLandArea && (
                  <AreaField
                    id="landArea"
                    propertyType="land"
                    initialArea={landArea}
                    initialUnit={landAreaUnit}
                    onChange={(area, unit) => {
                      setLandArea(area);
                      setLandAreaUnit(unit);
                    }}
                  />
                )}

                {/* Built Area — apartment, house, commercial_building, warehouse */}
                {showBuiltArea && (
                  <AreaField
                    id="builtArea"
                    label="Built Area"
                    propertyType={isCommercialType ? 'commercial' : (propertyType as 'house' | 'apartment')}
                    initialArea={builtArea}
                    initialUnit={builtAreaUnit}
                    onChange={(area, unit) => {
                      setBuiltArea(area);
                      setBuiltAreaUnit(unit);
                    }}
                  />
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

                {/* Carpet Area — commercial shop/office */}
                {propertyType === 'commercial' && (
                  <AreaField
                    id="carpetArea"
                    label="Carpet Area"
                    propertyType="commercial"
                    initialArea={carpetArea}
                    initialUnit={carpetAreaUnit}
                    onChange={(area, unit) => {
                      setCarpetArea(area);
                      setCarpetAreaUnit(unit);
                    }}
                  />
                )}

                {/* Floor Number — commercial */}
                {propertyType === 'commercial' && (
                  <div className="space-y-2">
                    <Label htmlFor="floorNumber">Floor Number *</Label>
                    <Input
                      id="floorNumber"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="e.g. 2"
                      value={floorNumber}
                      onChange={(e) => setFloorNumber(e.target.value)}
                    />
                  </div>
                )}

                {/* Total Floors — commercial_building */}
                {propertyType === 'commercial_building' && (
                  <div className="space-y-2">
                    <Label htmlFor="totalFloors">Total Floors *</Label>
                    <Input
                      id="totalFloors"
                      type="number"
                      min="1"
                      max="100"
                      placeholder="e.g. 5"
                      value={totalFloors}
                      onChange={(e) => setTotalFloors(e.target.value)}
                    />
                  </div>
                )}

                {/* Commercial shared fields */}
                {isCommercialType && propertyType !== 'commercial_land' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="furnishingStatus">Furnishing Status</Label>
                      <Select value={furnishingStatus} onValueChange={setFurnishingStatus}>
                        <SelectTrigger id="furnishingStatus">
                          <SelectValue placeholder="Select furnishing" />
                        </SelectTrigger>
                        <SelectContent>
                          {FURNISHING_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="washrooms">Washrooms</Label>
                        <Input
                          id="washrooms"
                          type="number"
                          min="0"
                          placeholder="e.g. 2"
                          value={washrooms}
                          onChange={(e) => setWashrooms(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parkingCount">Parking Spots</Label>
                        <Input
                          id="parkingCount"
                          type="number"
                          min="0"
                          placeholder="e.g. 4"
                          value={parkingCount}
                          onChange={(e) => setParkingCount(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {isCommercialType && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="roadFrontageFt">Road Frontage (ft)</Label>
                      <Input
                        id="roadFrontageFt"
                        type="number"
                        min="0"
                        step="any"
                        placeholder="e.g. 30"
                        value={roadFrontageFt}
                        onChange={(e) => setRoadFrontageFt(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commercialUsage">Usage / Business Type</Label>
                      <Input
                        id="commercialUsage"
                        placeholder="e.g. Retail, Office, Restaurant"
                        value={commercialUsage}
                        onChange={(e) => setCommercialUsage(e.target.value)}
                      />
                    </div>
                    {(propertyType === 'commercial_building' || propertyType === 'warehouse') && (
                      <div className="space-y-2">
                        <Label htmlFor="numberOfUnits">Number of Units</Label>
                        <Input
                          id="numberOfUnits"
                          type="number"
                          min="1"
                          placeholder="e.g. 8"
                          value={numberOfUnits}
                          onChange={(e) => setNumberOfUnits(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Rent fields */}
                {isRent && (
                  <div className="space-y-4 rounded-md border p-4 bg-muted/30">
                    <p className="text-sm font-medium">Rent Details</p>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyRent">Monthly Rent (₹) *</Label>
                      <Input
                        id="monthlyRent"
                        type="number"
                        min="1"
                        placeholder="e.g. 15000"
                        value={monthlyRent}
                        onChange={(e) => setMonthlyRent(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="securityDepositMonths">Security Deposit (months) *</Label>
                        <Input
                          id="securityDepositMonths"
                          type="number"
                          min="0"
                          max="24"
                          placeholder="e.g. 10"
                          value={securityDepositMonths}
                          onChange={(e) => setSecurityDepositMonths(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lockInMonths">Lock-in Period (months)</Label>
                        <Input
                          id="lockInMonths"
                          type="number"
                          min="0"
                          max="60"
                          placeholder="e.g. 12"
                          value={lockInMonths}
                          onChange={(e) => setLockInMonths(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* RERA Number — apartment / house only */}
                {(propertyType === 'apartment' || propertyType === 'house') && (
                  <div className="space-y-2">
                    <Label htmlFor="reraNumber">RERA Number (optional)</Label>
                    <Input
                      id="reraNumber"
                      placeholder="e.g., PRM/KA/RERA/1251/..."
                      maxLength={80}
                      value={reraNumber}
                      onChange={(e) => setReraNumber(e.target.value)}
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
                  <Label htmlFor="videoUrl" className="text-sm font-medium">Property Video (optional)</Label>
                  <p className="text-xs text-muted-foreground">YouTube or Instagram Reel link</p>
                  <Input
                    id="videoUrl"
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

                <div className="flex flex-col items-end pt-4 border-t gap-1">
                  <Button
                    type="button"
                    onClick={handleStep2Continue}
                    disabled={!canSubmitImages}
                  >
                    Save & Continue
                  </Button>
                  {!canSubmitImages && (
                    <p className="text-sm text-muted-foreground">
                      Add at least 3 photos to continue.
                    </p>
                  )}
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
                <div className="flex flex-col items-end pt-4 border-t gap-1">
                  <Button
                    type="button"
                    onClick={handleStep3Continue}
                    disabled={!listing.addressConfirmed}
                  >
                    Save & Continue
                  </Button>
                  {!listing.addressConfirmed && (
                    <p className="text-sm text-muted-foreground">
                      Confirm your pin location on the map to continue.
                    </p>
                  )}
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
                    {listing.listingPurpose === 'rent' && ' · For Rent'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {listing.listingPurpose === 'rent'
                      ? listing.monthlyRent != null
                        ? `₹${listing.monthlyRent.toLocaleString('en-IN')}/mo`
                        : '—'
                      : listing.price != null
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Photos</p>
                  {listingImages.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 overflow-x-auto pb-1">
                      {listingImages.slice(0, 5).map((img, i) => (
                        <img
                          key={img.id}
                          src={img.url}
                          alt={`Photo ${i + 1}`}
                          className="h-12 w-12 object-cover rounded-md flex-shrink-0"
                        />
                      ))}
                      {listingImages.length > 5 && (
                        <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium">
                          +{listingImages.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
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
            <PoiManager listingId={id!} propertyType={listing.propertyType} />
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
                      step: 2,
                    },
                    {
                      label: 'Location confirmed',
                      met: !!listing.addressConfirmed,
                      detail: listing.addressConfirmed
                        ? 'Pin position confirmed on map'
                        : 'Confirm your pin location in step 3',
                      step: 3,
                    },
                    {
                      label: 'Required fields',
                      met: requiredFieldsComplete,
                      detail: requiredFieldsComplete
                        ? 'All required fields filled in'
                        : isRent
                          ? 'Monthly rent, property type, and locality required'
                          : 'Price, property type, and locality required',
                      step: 1,
                    },
                  ].map(({ label, met, detail, step }) => (
                    <div
                      key={label}
                      className={`flex items-start gap-3 rounded-md transition-colors ${
                        !met ? 'cursor-pointer hover:bg-accent/60 px-2 py-1 -mx-2' : ''
                      }`}
                      onClick={!met ? () => { setCameFromReview(true); setCurrentStep(step); } : undefined}
                      role={!met ? 'button' : undefined}
                      tabIndex={!met ? 0 : undefined}
                      onKeyDown={!met ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') { setCameFromReview(true); setCurrentStep(step); }
                      } : undefined}
                    >
                      {met
                        ? <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        : <X className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {detail}
                          {!met && <span className="ml-1 text-primary font-medium">→ Fix now</span>}
                        </p>
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
