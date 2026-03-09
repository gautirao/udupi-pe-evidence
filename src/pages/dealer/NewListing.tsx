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
import { ApiError } from '@/lib/api';

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

    createListing.mutate(
      {
        propertyType,
        title: title.trim() || undefined,
        price: priceRupees,
        description: description.trim() || undefined,
        landArea: landAreaNum && !isNaN(landAreaNum) ? landAreaNum : undefined,
        bedrooms: bedroomsNum && !isNaN(bedroomsNum) ? bedroomsNum : undefined,
      },
      {
        onSuccess: (data) => {
          toast({ title: 'Draft saved', description: 'Your listing has been created as a draft.' });
          navigate(`/dealer/listings/${data.id}/edit`);
        },
        onError: (error: Error) => {
          const apiErr = error as ApiError;
          const body = apiErr.body as Record<string, unknown> | undefined;
          const message =
            (body?.message as string) ??
            (body?.error as string) ??
            'Failed to save draft. Please try again.';
          toast({
            title: 'Save failed',
            description: message,
            variant: 'destructive',
          });
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
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-0 px-6 pb-4">
            {[
              { n: 1, label: 'Describe' },
              { n: 2, label: 'Add Photos' },
              { n: 3, label: 'Pin Location' },
            ].map((step, i, arr) => (
              <div key={step.n} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                      step.n === 1
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step.n}
                  </div>
                  <span
                    className={`mt-1 text-xs ${
                      step.n === 1 ? 'text-primary font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div className="w-12 h-px bg-border mx-2 mb-4" />
                )}
              </div>
            ))}
          </div>
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
                <Label htmlFor="landArea">Land Area (sq ft)</Label>
                <Input
                  id="landArea"
                  type="number"
                  min="0"
                  placeholder="e.g. 2400"
                  value={landArea}
                  onChange={(e) => setLandArea(e.target.value)}
                />
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
