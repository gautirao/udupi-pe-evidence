import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateListing } from '@/hooks/useDealerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PriceField } from '@/components/dealer/PriceField';
import { StepIndicator } from '@/components/dealer/StepIndicator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const PROPERTY_TYPES = [
  { value: 'land', label: 'Land' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'commercial', label: 'Commercial' },
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

export default function NewListing() {
  const { userRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const createListing = useCreateListing();
  const { toast } = useToast();

  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [title, setTitle] = useState('');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [description, setDescription] = useState('');

  // Conditional field state (captured for UX; persisted on edit page via PUT)
  const [landArea, setLandArea] = useState('');
  // Default 'cent' — dominant Udupi/Karnataka unit
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [bedrooms, setBedrooms] = useState('');

  // Dealer-only guard: allow dealer and admin roles
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

  const isCommercial = propertyType === 'commercial';
  const canSubmit = propertyType !== '' && !isCommercial && priceRupees != null && priceRupees > 0;

  const handleSaveDraft = async () => {
    if (!propertyType || isCommercial) return;

    if (!priceRupees || priceRupees <= 0) {
      toast({
        title: 'Invalid price',
        description: 'Please enter a valid price greater than 0.',
        variant: 'destructive',
      });
      return;
    }

    const landAreaNum = landArea ? parseFloat(landArea) : undefined;
    const bedroomsNum = bedrooms ? parseInt(bedrooms, 10) : undefined;

    const resolvedLandArea = landAreaNum && !isNaN(landAreaNum) ? landAreaNum : undefined;

    createListing.mutate(
      {
        propertyType,
        title: title.trim() || undefined,
        price: priceRupees,
        description: description.trim() || undefined,
        landArea: resolvedLandArea,
        landAreaUnit: resolvedLandArea !== undefined ? landAreaUnit : undefined,
        bedrooms: bedroomsNum && !isNaN(bedroomsNum) ? bedroomsNum : undefined,
      },
      {
        onSuccess: (data) => {
          toast({ title: 'Draft saved', description: 'Your listing has been created as a draft.' });
          navigate(`/dealer/listings/${data.id}/edit?step=2`);
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
                isComplete: propertyType !== '' && (priceRupees ?? 0) > 0 && !isCommercial,
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

            {/* Commercial disabled notice */}
            {isCommercial && (
              <Alert>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <AlertDescription>
                  Commercial listings are not supported yet. Please select a different property type.
                </AlertDescription>
              </Alert>
            )}

            {/* Conditional: Land Area */}
            {propertyType === 'land' && (
              <div className="space-y-2">
                <Label htmlFor="landArea">Land Area</Label>
                <Input
                  id="landArea"
                  type="number"
                  min="0"
                  placeholder="e.g. 2400"
                  value={landArea}
                  onChange={(e) => setLandArea(e.target.value)}
                />
                <ToggleGroup
                  type="single"
                  value={landAreaUnit}
                  onValueChange={(v) => { if (v) setLandAreaUnit(v); }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="cent" aria-label="Cents">Cents</ToggleGroupItem>
                  <ToggleGroupItem value="gunta" aria-label="Guntas">Guntas</ToggleGroupItem>
                  <ToggleGroupItem value="sqft" aria-label="Sq Ft">Sq Ft</ToggleGroupItem>
                  <ToggleGroupItem value="sqm" aria-label="Sq M">Sq M</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  You can update this on the edit page after saving.
                </p>
              </div>
            )}

            {/* Conditional: Bedrooms */}
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
                <p className="text-xs text-muted-foreground">
                  You can update this on the edit page after saving.
                </p>
              </div>
            )}

            {/* Title */}
            {propertyType && !isCommercial && (
              <>
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
                <PriceField
                  id="price"
                  initialRupees={null}
                  onChange={setPriceRupees}
                  required
                />

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
            {propertyType && !isCommercial && (
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => navigate('/dealer/listings')}>
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
