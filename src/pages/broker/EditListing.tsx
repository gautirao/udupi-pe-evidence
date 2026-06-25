import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGetListing, useUpdateListing, useSubmitListing } from '@/hooks/useBrokerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Loader2, Lock, Check, MapPin, X, Link, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImageUploader } from '@/components/broker/ImageUploader';
import { useListingImages } from '@/hooks/useListingImages';
import { PriceField } from '@/components/broker/PriceField';
import { AreaField } from '@/components/broker/AreaField';
import { AddressPicker } from '@/components/broker/AddressPicker';
import { PoiManager } from '@/components/poi/PoiManager';
import { StepIndicator } from '@/components/broker/StepIndicator';
import { SectionCard } from '@/components/broker/SectionCard';
import { ListingPurposeToggle } from '@/components/broker/ListingPurposeToggle';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import { BoundaryDrawStep } from '@/components/dealer/BoundaryDrawStep';
import { ApiError } from '@/lib/api';
import { formatListingId } from '@/lib/listing-id';
import { COMMERCIAL_TYPES, FURNISHING_OPTIONS } from '@/lib/listing-constants';
import type { PropertyType } from '@/lib/listing-constants';
import { intOrUndef, floatOrUndef } from '@/lib/listing-utils';
import { fromGeoJsonString, toGeoJsonString } from '@/lib/geoJsonUtils';
import {
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  LAND_CATEGORY_LABELS,
} from '@/lib/agriFieldLabels';

const VIDEO_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|instagram\.com\/(reel|p)\/)[^\s]+/;

// Issue #1458 + #1459 — derive canonical value lists from shared label maps to avoid duplication.
// Any future addition to agriFieldLabels.ts is automatically reflected here.
const KNOWN_WATER_SOURCES = Object.keys(WATER_SOURCE_LABELS);
const KNOWN_SOIL_TYPES = Object.keys(SOIL_TYPE_LABELS);
const KNOWN_ROAD_ACCESS_VALUES = Object.keys(ROAD_ACCESS_LABELS);
const KNOWN_CULTIVATION_STATUSES = Object.keys(CULTIVATION_STATUS_LABELS);
const KNOWN_OWNERSHIP_TYPES = Object.keys(OWNERSHIP_TYPE_LABELS);
const KNOWN_LAND_CATEGORIES = Object.keys(LAND_CATEGORY_LABELS);

function extractYouTubeId(url: string): string | null {
  const shortMatch = url.match(/youtu\.be\/([^?&\s]+)/);
  if (shortMatch) return shortMatch[1];
  const longMatch = url.match(/[?&]v=([^&\s]+)/);
  return longMatch ? longMatch[1] : null;
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(reel|p)\//.test(url);
}

const LOCKED_STATUSES = ['PENDING_REVIEW', 'LIVE'];
const SUBMITTABLE_STATUSES = ['DRAFT', 'REJECTED'];

const BASE_STEPS = ['Describe', 'Add Photos', 'Pin Location', 'Review & Submit'] as const;
const AGRI_STEPS = ['Describe', 'Add Photos', 'Pin Location', 'Draw Boundary', 'Review & Submit'] as const;

export default function EditListing() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
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

  // Dynamic wizard steps: agri listings get an extra "Draw Boundary" step (step 4).
  // NOTE: propertyType state starts as '' and is populated by the useEffect below once
  // the listing loads. The step count may change on first render, but useState captures
  // the initial value at mount — the clamp is re-applied in the steps array below.
  const isAgriListing = propertyType === 'agricultural_land';
  const WIZARD_STEPS = isAgriListing ? AGRI_STEPS : BASE_STEPS;
  const reviewStep = WIZARD_STEPS.length; // step number of the final "Review & Submit" step
  const boundaryStep = isAgriListing ? AGRI_STEPS.indexOf('Draw Boundary') + 1 : 0;

  // Step routing: read initial step from ?step= query param (1-based, default 1).
  // Guard against non-numeric values (e.g. ?step=abc → NaN) and clamp to [1, WIZARD_STEPS.length].
  const stepParam = searchParams.get('step');
  const initialStep = stepParam ? (Math.max(1, Math.min(WIZARD_STEPS.length, parseInt(stepParam, 10) || 1))) : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  // When true: after saving a step, return to step 4 instead of advancing sequentially
  const [cameFromReview, setCameFromReview] = useState(false);
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

  /**
   * D1 hybrid — Title auto-regen from confirmed locality.
   * `titleManuallyEdited` is set the first time the broker manually types in
   * the title field. While false, onLocalityConfirmed auto-updates the title.
   */
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  /**
   * The last locality string that was confirmed via AddressPicker pin confirm
   * (AC5). Used in Step 4 to detect title/locality disagreement.
   */
  const [confirmedLocality, setConfirmedLocality] = useState('');

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

  // Agricultural land fields
  const [waterSource, setWaterSource] = useState('');
  const [soilType, setSoilType] = useState('');
  const [roadAccess, setRoadAccess] = useState('');
  const [cultivationStatus, setCultivationStatus] = useState('');
  const [ownershipType, setOwnershipType] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  // Issue #1458 — new structured agri fields
  const [landCategory, setLandCategory] = useState('');
  // '' = not specified; 'true'/'false' for Select binding
  const [farmhouseAvailable, setFarmhouseAvailable] = useState('');
  const [fencingDone, setFencingDone] = useState('');
  // Agricultural plot boundary — [lat, lng][] coords from DrawControl
  const [boundaryCoords, setBoundaryCoords] = useState<[number, number][]>([]);

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
    // (dominant Udupi/Karnataka unit, matches NewListing default).
    // For agricultural_land, fall back to 'acre' (dominant unit for that type).
    setLandAreaUnit(listing.landAreaUnit ?? (listing.propertyType === 'agricultural_land' ? 'acre' : 'cent'));
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
    setWaterSource(listing.waterSource ?? '');
    setSoilType(listing.soilType ?? '');
    setRoadAccess(listing.roadAccess ?? '');
    setCultivationStatus(listing.cultivationStatus ?? '');
    setOwnershipType(listing.ownershipType ?? '');
    setSurveyNumber(listing.surveyNumber ?? '');
    // Issue #1458 — pre-populate new structured agri fields
    setLandCategory(listing.landCategory ?? '');
    setFarmhouseAvailable(
      listing.farmhouseAvailable === true ? 'true'
        : listing.farmhouseAvailable === false ? 'false'
        : '',
    );
    setFencingDone(
      listing.fencingDone === true ? 'true'
        : listing.fencingDone === false ? 'false'
        : '',
    );
    // Pre-populate boundary coords from existing agri listing
    if (listing.boundary) {
      setBoundaryCoords(fromGeoJsonString(listing.boundary));
    }
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
  if (role !== 'dealer' && role !== 'admin' && role !== 'user' && role !== 'broker') {
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

  // Step 1 is complete when required fields match the submit gate (requiredFieldsComplete).
  // For rent listings: propertyType + monthlyRent + locality. For sale: propertyType + price + locality.
  const step1Complete = listingPurpose === 'rent'
    ? (!!propertyType && monthlyRent !== '' && parseInt(monthlyRent, 10) > 0 && !!locality)
    : (!!propertyType && (priceRupees ?? 0) > 0 && !!locality);
  // Step 2 is complete when >= 3 images have been uploaded (tracked by canSubmitImages)
  const step2Complete = canSubmitImages;
  // Step 3 is complete when address has been confirmed
  const step3Complete = listing.addressConfirmed === true;

  const steps = isAgriListing
    ? [
        { label: WIZARD_STEPS[0], isComplete: step1Complete },
        { label: WIZARD_STEPS[1], isComplete: step2Complete },
        { label: WIZARD_STEPS[2], isComplete: step3Complete },
        { label: WIZARD_STEPS[3], isComplete: false }, // Draw Boundary — not tracked as gate
        { label: WIZARD_STEPS[4], isComplete: false }, // terminal step
      ]
    : [
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
    || propertyType === 'commercial_building' || propertyType === 'warehouse'
    || propertyType === 'agricultural_land';
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
        waterSource: waterSource.trim() || undefined,
        soilType: soilType.trim() || undefined,
        roadAccess: roadAccess.trim() || undefined,
        cultivationStatus: cultivationStatus.trim() || undefined,
        ownershipType: ownershipType.trim() || undefined,
        surveyNumber: surveyNumber.trim() || undefined,
        // Issue #1458 — new structured agri fields
        landCategory: landCategory || undefined,
        farmhouseAvailable: farmhouseAvailable === 'true' ? true : farmhouseAvailable === 'false' ? false : undefined,
        fencingDone: fencingDone === 'true' ? true : fencingDone === 'false' ? false : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: 'Listing updated', description: 'Your listing has been saved.' });
          if (cameFromReview) {
            setCameFromReview(false);
            setCurrentStep(reviewStep);
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
            setCurrentStep(reviewStep);
          } else {
            setCurrentStep(3);
          }
        },
      },
    );
  };

  const handleStep3Continue = () => {
    setCameFromReview(false);
    // For agri listings, step 4 = Draw Boundary; for others, step 4 = Review & Submit.
    // Using isAgriListing ? 4 : reviewStep makes this safe if BASE_STEPS ever changes.
    setCurrentStep(isAgriListing ? 4 : reviewStep);
  };

  // Step 4 handlers — only reached for agricultural_land listings
  const handleStep4Continue = (coords: [number, number][]) => {
    setBoundaryCoords(coords);
    // Persist boundary to backend immediately (mirrors how step 3 saves location)
    updateListing.mutate(
      { boundary: toGeoJsonString(coords) },
      {
        onSuccess: () => {
          setCurrentStep(reviewStep);
        },
      },
    );
  };

  const handleStep4Skip = () => {
    // Boundary remains whatever it was (may be empty); advance to review
    setCurrentStep(reviewStep);
  };

  /**
   * AC5 / D1 hybrid — called by AddressPicker after broker confirms a pin.
   * Auto-regenerates the title from the confirmed locality when the broker
   * has not yet manually edited the title field.
   */
  const handleLocalityConfirmed = (locality: string, _lat: number, _lng: number) => {
    setConfirmedLocality(locality);
    if (!titleManuallyEdited) {
      // Generate a sensible default title from the confirmed locality.
      // Extract the first meaningful segment (everything up to the first comma)
      // to keep the title concise.
      const shortLocality = locality.split(',')[0].trim();
      if (shortLocality) {
        setTitle(`Property in ${shortLocality}`);
      }
    }
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

  /**
   * D1 hybrid — Step 4 title/locality consistency gate.
   * Show the non-dismissible warning banner when:
   *   1. A locality has been confirmed via AddressPicker (confirmedLocality set), AND
   *   2. The broker has manually edited the title (titleManuallyEdited = true), AND
   *   3. The current title does NOT include the confirmed locality's first segment.
   *
   * When titleManuallyEdited is false, the title was auto-regenerated and will
   * always be consistent — no banner needed.
   */
  const confirmedLocalityShort = confirmedLocality.split(',')[0].trim().toLowerCase();
  const titleIncludesLocality =
    !confirmedLocalityShort || title.toLowerCase().includes(confirmedLocalityShort);
  const showTitleLocalityWarning =
    titleManuallyEdited &&
    !!confirmedLocality &&
    !titleIncludesLocality;

  const statusBadgeVariant = listing.status === 'REJECTED'
    ? 'destructive'
    : listing.status === 'DRAFT'
    ? 'secondary'
    : 'outline';

  const requiredFieldsComplete = isRent
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0 && !!propertyType && !!locality)
    : (priceRupees != null && priceRupees > 0 && !!propertyType && !!locality);
  const allConditionsMet =
    canSubmitImages &&
    !!listing.addressConfirmed &&
    requiredFieldsComplete &&
    !showTitleLocalityWarning;

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
        />

        {/* ── Step 1: Describe ── */}
        <div data-testid="step-1-panel" style={{ display: currentStep === 1 ? 'block' : 'none' }}>
          <form onSubmit={handleStep1Save} className="space-y-6">
            {/* Listing basics */}
            <SectionCard title="Listing basics">
              {/* Property Type */}
              <div className="space-y-2">
                <Label htmlFor="propertyType">Property Type</Label>
                <PropertyTypeCardSelector
                  id="propertyType"
                  value={propertyType}
                  onChange={setPropertyType}
                />
              </div>

              {/* Listing Purpose (Sale / Rent) */}
              <div className="space-y-2">
                <Label>Listing Purpose</Label>
                <div>
                  <ListingPurposeToggle value={listingPurpose} onChange={setListingPurpose} />
                </div>
              </div>
            </SectionCard>

            {/* Property details — size, layout and type-specific fields */}
            <SectionCard title="Property details">
                {/* Land Area — land, commercial_land, commercial_building, warehouse, agricultural_land */}
                {showLandArea && (
                  <AreaField
                    id="landArea"
                    propertyType={propertyType === 'agricultural_land' ? 'agricultural_land' : 'land'}
                    initialArea={landArea}
                    initialUnit={landAreaUnit}
                    onChange={(area, unit) => {
                      setLandArea(area);
                      setLandAreaUnit(unit);
                    }}
                  />
                )}

                {/* Agricultural Land Fields — shown only for agricultural_land */}
                {propertyType === 'agricultural_land' && (
                  <div className="space-y-4" data-testid="agri-fields-section">
                    <h3 className="text-sm font-medium text-foreground">Agricultural Land Details</h3>

                    {/* Land Category — Issue #1458 */}
                    <div className="space-y-2">
                      <Label htmlFor="landCategory">Land Category</Label>
                      <Select value={landCategory} onValueChange={setLandCategory}>
                        <SelectTrigger id="landCategory">
                          <SelectValue placeholder="Select land category" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Issue #1459 — legacy free-text fallback (same pattern as waterSource) */}
                          {landCategory && !KNOWN_LAND_CATEGORIES.includes(landCategory) && (
                            <SelectItem value={landCategory}>{landCategory} (legacy)</SelectItem>
                          )}
                          {Object.entries(LAND_CATEGORY_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Water Source */}
                    <div className="space-y-2">
                      <Label htmlFor="waterSource">Water Source</Label>
                      <Select value={waterSource} onValueChange={setWaterSource}>
                        <SelectTrigger id="waterSource">
                          <SelectValue placeholder="Select water source" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Issue #1458 — show a legacy free-text value as a visible option
                              when the stored value doesn't match any known enum. This prevents
                              the Select from rendering blank while still preserving the value
                              on save-without-change. */}
                          {waterSource && !KNOWN_WATER_SOURCES.includes(waterSource) && (
                            <SelectItem value={waterSource}>{waterSource} (legacy)</SelectItem>
                          )}
                          <SelectItem value="BOREWELL">Borewell</SelectItem>
                          <SelectItem value="WELL">Open well</SelectItem>
                          <SelectItem value="RIVER">River</SelectItem>
                          <SelectItem value="RAIN_FED">Rain-fed</SelectItem>
                          <SelectItem value="POND">Pond</SelectItem>
                          <SelectItem value="STREAM">Stream</SelectItem>
                          <SelectItem value="NOT_AVAILABLE">Not available</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Farmhouse Available — Issue #1458 */}
                    <div className="space-y-2">
                      <Label htmlFor="farmhouseAvailable">Farmhouse Available</Label>
                      <Select value={farmhouseAvailable} onValueChange={setFarmhouseAvailable}>
                        <SelectTrigger id="farmhouseAvailable">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Fencing Done — Issue #1458 */}
                    <div className="space-y-2">
                      <Label htmlFor="fencingDone">Fencing Done</Label>
                      <Select value={fencingDone} onValueChange={setFencingDone}>
                        <SelectTrigger id="fencingDone">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Soil Type */}
                    <div className="space-y-2">
                      <Label htmlFor="soilType">Soil Type</Label>
                      <Select value={soilType} onValueChange={setSoilType}>
                        <SelectTrigger id="soilType">
                          <SelectValue placeholder="Select soil type" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Issue #1459 — legacy free-text fallback, same pattern as waterSource */}
                          {soilType && !KNOWN_SOIL_TYPES.includes(soilType) && (
                            <SelectItem value={soilType}>{soilType} (legacy)</SelectItem>
                          )}
                          <SelectItem value="RED_LATERITE">Red laterite</SelectItem>
                          <SelectItem value="BLACK_COTTON">Black cotton</SelectItem>
                          <SelectItem value="ALLUVIAL">Alluvial</SelectItem>
                          <SelectItem value="SANDY_LOAM">Sandy loam</SelectItem>
                          <SelectItem value="CLAY">Clay</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Road Access */}
                    <div className="space-y-2">
                      <Label htmlFor="roadAccess">Road Access</Label>
                      <Select value={roadAccess} onValueChange={setRoadAccess}>
                        <SelectTrigger id="roadAccess">
                          <SelectValue placeholder="Select road access" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Issue #1459 — legacy free-text fallback (e.g. old 'Gravel road' values) */}
                          {roadAccess && !KNOWN_ROAD_ACCESS_VALUES.includes(roadAccess) && (
                            <SelectItem value={roadAccess}>{roadAccess} (legacy)</SelectItem>
                          )}
                          <SelectItem value="TARRED_ROAD">Tarred road</SelectItem>
                          <SelectItem value="KACHCHA_ROAD">Kachcha road</SelectItem>
                          <SelectItem value="HIGHWAY_FRONTAGE">Highway frontage</SelectItem>
                          <SelectItem value="NO_ROAD_ACCESS">No road access</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cultivation Status */}
                    <div className="space-y-2">
                      <Label htmlFor="cultivationStatus">Cultivation Status</Label>
                      <Select value={cultivationStatus} onValueChange={setCultivationStatus}>
                        <SelectTrigger id="cultivationStatus">
                          <SelectValue placeholder="Select cultivation status" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Issue #1459 — legacy free-text fallback (e.g. old 'Uncultivated' values) */}
                          {cultivationStatus && !KNOWN_CULTIVATION_STATUSES.includes(cultivationStatus) && (
                            <SelectItem value={cultivationStatus}>{cultivationStatus} (legacy)</SelectItem>
                          )}
                          <SelectItem value="CULTIVATED">Cultivated</SelectItem>
                          <SelectItem value="FALLOW">Fallow</SelectItem>
                          <SelectItem value="ARECA_PLANTATION">Areca plantation</SelectItem>
                          <SelectItem value="COCONUT_PLANTATION">Coconut plantation</SelectItem>
                          <SelectItem value="PARTIALLY_CULTIVATED">Partially cultivated</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Ownership Type */}
                    <div className="space-y-2">
                      <Label htmlFor="ownershipType">Ownership Type</Label>
                      <Select value={ownershipType} onValueChange={setOwnershipType}>
                        <SelectTrigger id="ownershipType">
                          <SelectValue placeholder="Select ownership type" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Issue #1459 — legacy free-text fallback */}
                          {ownershipType && !KNOWN_OWNERSHIP_TYPES.includes(ownershipType) && (
                            <SelectItem value={ownershipType}>{ownershipType} (legacy)</SelectItem>
                          )}
                          <SelectItem value="FREEHOLD">Freehold</SelectItem>
                          <SelectItem value="INHERITED">Inherited</SelectItem>
                          <SelectItem value="PATTA">Patta</SelectItem>
                          <SelectItem value="SURVEY_SETTLEMENT">Survey settlement</SelectItem>
                          <SelectItem value="KATHA">Katha</SelectItem>
                          <SelectItem value="REVENUE">Revenue</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Survey Number */}
                    <div className="space-y-2">
                      <Label htmlFor="surveyNumber">Survey Number</Label>
                      <Input
                        id="surveyNumber"
                        type="text"
                        maxLength={64}
                        placeholder="e.g. 123/4A"
                        value={surveyNumber}
                        onChange={(e) => setSurveyNumber(e.target.value)}
                      />
                    </div>
                  </div>
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
            </SectionCard>

            {/* Listing information */}
            <SectionCard title="Listing information">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. 3 BHK Apartment in Manipal"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleManuallyEdited(true);
                  }}
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

              {/* Price */}
              <PriceField initialRupees={priceRupees} onChange={setPriceRupees} required />

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
            </SectionCard>

            {/* Step 1 action */}
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={updateListing.isPending}>
                {updateListing.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save & Continue
              </Button>
            </div>
          </form>
        </div>

        {/* ── Step 2: Add Photos ── */}
        <div data-testid="step-2-panel" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
          {isSubmittable && (
            <div className="space-y-6">
              <SectionCard
                title="Listing images"
                description="A great set of photos helps buyers understand the property better."
              >
                {/* ImageUploader is always mounted (CSS visibility) so upload state is preserved */}
                <ImageUploader listingId={id!} onCanSubmitChange={setCanSubmitImages} />
              </SectionCard>

              <SectionCard
                title="Property video"
                description="Optional — add a YouTube or Instagram Reel link to give buyers a walkthrough."
              >
                <div className="space-y-2">
                  <Label htmlFor="videoUrl" className="sr-only">Property video link</Label>
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
              </SectionCard>

              <div className="flex flex-col items-end gap-1">
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
            </div>
          )}
        </div>

        {/* ── Step 3: Pin Location ── */}
        <div data-testid="step-3-panel" style={{ display: currentStep === 3 ? 'block' : 'none' }}>
          {isSubmittable && (
            <div className="space-y-6">
              <SectionCard
                title="Confirm location"
                description="Search for your listing's address, drag the pin to the exact spot, then confirm."
              >
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
                  onLocalityConfirmed={handleLocalityConfirmed}
                />
              </SectionCard>

              <div className="flex flex-col items-end gap-1">
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
            </div>
          )}
        </div>

        {/* ── Step 4: Draw Boundary (agricultural_land only) ── */}
        {currentStep === 4 && isAgriListing && (
          <div data-testid="step-4-panel">
            <SectionCard
              title="Draw plot boundary"
              description="Optionally draw the boundary of your agricultural plot on the map."
            >
              <BoundaryDrawStep
                initialCoords={boundaryCoords}
                center={[listing.latitude ?? 13.3442, listing.longitude ?? 74.7451]}
                onSave={handleStep4Continue}
                onSkip={handleStep4Skip}
                declaredArea={listing.landArea}
                declaredUnit={listing.landAreaUnit}
                computedAreaAcres={listing.computedAreaAcres}
              />
            </SectionCard>
          </div>
        )}

        {/* ── Step 4 (non-agri) / Step 5 (agri): Review & Submit ── */}
        {currentStep === reviewStep && (
        <div data-testid="step-review-panel">

          {/* D1 hybrid — Title/locality consistency banner (non-dismissible) */}
          {showTitleLocalityWarning && (
            <div
              role="alert"
              data-testid="title-locality-warning"
              className="mb-4 flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-yellow-600" />
              <div className="flex-1">
                <p className="font-medium">Title doesn't reflect the selected area</p>
                <p className="text-yellow-800 mt-0.5">
                  Your title doesn't mention the confirmed location ({confirmedLocality.split(',')[0].trim()}).
                  Update your title or click below to reset it.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-shrink-0 border-yellow-400 text-yellow-900 hover:bg-yellow-100"
                onClick={() => {
                  const shortLocality = confirmedLocality.split(',')[0].trim();
                  if (shortLocality) {
                    setTitle(`Property in ${shortLocality}`);
                    setTitleManuallyEdited(false);
                  }
                }}
              >
                Update title
              </Button>
            </div>
          )}

          {/* Review summary */}
          <SectionCard
            className="mb-4"
            title="Review your listing"
            description="Check the details below before submitting for admin review."
            contentClassName="space-y-4"
          >
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
          </SectionCard>

          {/* Boundary review — shown for agri listings when a boundary has been drawn */}
          {isAgriListing && (
            <SectionCard className="mb-4" title="Plot boundary" contentClassName="space-y-3">
                {boundaryCoords.length > 0 ? (
                  <>
                    <div
                      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                      role="note"
                      data-testid="boundary-disclaimer-review"
                    >
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                      <p>
                        The boundary drawn on the map is approximate and should be legally verified
                        before purchase.
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Boundary saved ({boundaryCoords.length} vertices).
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No boundary drawn (optional).</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setCameFromReview(false); setCurrentStep(boundaryStep); }}
                  data-testid="boundary-review-edit-btn"
                >
                  {boundaryCoords.length > 0 ? 'Edit Boundary' : 'Draw Boundary'}
                </Button>
            </SectionCard>
          )}

          {/* POIs — shown when address is confirmed */}
          {listing.addressConfirmed ? (
            <PoiManager listingId={id!} propertyType={listing.propertyType} />
          ) : (
            <SectionCard className="mb-4" title="Nearby points of interest">
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <MapPin className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Location not yet confirmed</p>
                  <p className="text-sm text-muted-foreground">
                    Confirm your listing's address in step 3 to enable POI suggestions.
                  </p>
                </div>
            </SectionCard>
          )}

          {/* Submit for Review (isSubmittable only) */}
          {isSubmittable && (
            <SectionCard
              title={(
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Ready to submit?
                </span>
              )}
              description="All requirements must be met before submitting for admin review."
              contentClassName="space-y-4"
            >
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
            </SectionCard>
          )}
        </div>
        )}

      </div>
    </AppLayout>
  );
}
