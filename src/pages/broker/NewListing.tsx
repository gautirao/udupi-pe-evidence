import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateListing } from '@/hooks/useBrokerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PriceField } from '@/components/broker/PriceField';
import { AreaField } from '@/components/broker/AreaField';
import { StepIndicator } from '@/components/broker/StepIndicator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Alert removed — commercial types are now fully supported
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export default function NewListing() {
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const createListing = useCreateListing();
  const { toast } = useToast();

  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [title, setTitle] = useState('');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [description, setDescription] = useState('');

  // Listing purpose: sale (default) or rent
  const [listingPurpose, setListingPurpose] = useState<'sale' | 'rent'>('sale');

  // Conditional field state (captured for UX; persisted on edit page via PUT)
  const [landArea, setLandArea] = useState<number | null>(null);
  // Default 'cent' — dominant Udupi/Karnataka unit
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');

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

  // Guard: allow dealer, admin, and user (owner) roles
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

  const isCommercialType = COMMERCIAL_TYPES.has(propertyType);
  const isRent = listingPurpose === 'rent';

  // Sale needs price > 0; rent needs monthlyRent > 0
  const priceValid = isRent
    ? (monthlyRent !== '' && parseInt(monthlyRent, 10) > 0)
    : (priceRupees != null && priceRupees > 0);
  const canSubmit = propertyType !== '' && priceValid;

  const handleSaveDraft = async () => {
    if (!propertyType) return;

    if (!isRent && (!priceRupees || priceRupees <= 0)) {
      toast({
        title: 'Invalid price',
        description: 'Please enter a valid price greater than 0.',
        variant: 'destructive',
      });
      return;
    }

    if (isRent && (!monthlyRent || parseInt(monthlyRent, 10) <= 0)) {
      toast({
        title: 'Invalid rent',
        description: 'Please enter a valid monthly rent greater than 0.',
        variant: 'destructive',
      });
      return;
    }

    const bedroomsNum = bedrooms ? parseInt(bedrooms, 10) : undefined;
    const resolvedLandArea = landArea != null && landArea > 0 ? landArea : undefined;
    const resolvedBuiltArea = builtArea != null && builtArea > 0 ? builtArea : undefined;
    const resolvedCarpetArea = carpetArea != null && carpetArea > 0 ? carpetArea : undefined;
    const intOrUndef = (v: string) => { const n = parseInt(v, 10); return !isNaN(n) && n > 0 ? n : undefined; };
    const floatOrUndef = (v: string) => { const n = parseFloat(v); return !isNaN(n) && n > 0 ? n : undefined; };

    createListing.mutate(
      {
        propertyType,
        title: title.trim() || undefined,
        price: isRent ? undefined : priceRupees ?? undefined,
        description: description.trim() || undefined,
        landArea: resolvedLandArea,
        landAreaUnit: resolvedLandArea !== undefined ? landAreaUnit : undefined,
        bedrooms: bedroomsNum && !isNaN(bedroomsNum) ? bedroomsNum : undefined,
        builtArea: resolvedBuiltArea,
        builtAreaUnit: resolvedBuiltArea !== undefined ? builtAreaUnit : undefined,
        listingPurpose,
        carpetArea: resolvedCarpetArea,
        carpetAreaUnit: resolvedCarpetArea !== undefined ? carpetAreaUnit : undefined,
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
        onSuccess: (data) => {
          toast({ title: 'Draft saved', description: 'Your listing has been created as a draft.' });
          navigate(`/broker/listings/${data.id}/edit?step=2`);
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="container max-w-2xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Create New Listing</CardTitle>
            <CardDescription>
              Price and property type are required. You'll add photos and location next.
            </CardDescription>
          </CardHeader>
          {/* Step indicator — step 1 only; steps 2–4 are gated until listing is created */}
          <StepIndicator
            steps={[
              {
                label: 'Describe',
                isComplete: propertyType !== '' && priceValid,
              },
              { label: 'Add Photos', isComplete: false },
              { label: 'Pin Location', isComplete: false },
              { label: 'Review & Submit', isComplete: false },
            ]}
            currentStep={1}
            onStepClick={(n) => { if (n <= 1) { /* no-op: only step 1 available */ } }}
          />
          <CardContent className="space-y-6">
            {/* Property Type */}
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type *</Label>
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

            {/* Listing Purpose (Sale / Rent) */}
            {propertyType && (
              <div className="space-y-2">
                <Label>Listing Purpose *</Label>
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
            )}

            {/* Conditional: Land Area — land, commercial_land, commercial_building, warehouse */}
            {(propertyType === 'land' || propertyType === 'commercial_land'
              || propertyType === 'commercial_building' || propertyType === 'warehouse') && (
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

            {/* Conditional: Built Area — house, apartment, commercial_building, warehouse */}
            {(propertyType === 'house' || propertyType === 'apartment'
              || propertyType === 'commercial_building' || propertyType === 'warehouse') && (
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

            {/* Conditional: Bedrooms — house / apartment */}
            {(propertyType === 'apartment' || propertyType === 'house') && (
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

            {/* Conditional: Carpet Area — commercial shop/office */}
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

            {/* Conditional: Floor Number — commercial */}
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

            {/* Conditional: Total Floors — commercial_building */}
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

            {/* Commercial shared fields: furnishing, washrooms, parking, road frontage, usage, units */}
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

            {/* Title */}
            {propertyType && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder={isCommercialType
                      ? 'e.g. 500 sqft Shop in Udupi Town'
                      : 'e.g. 3 BHK Apartment in Manipal'}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Price — for sale listings */}
                {!isRent && (
                  <PriceField
                    id="price"
                    initialRupees={null}
                    onChange={setPriceRupees}
                    required
                  />
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
              </>
            )}

            {/* Actions */}
            {propertyType && (
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => navigate('/broker/listings')}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveDraft}
                  disabled={!canSubmit || createListing.isPending}
                >
                  {createListing.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {createListing.isPending ? 'Saving…' : 'Save & Continue'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
