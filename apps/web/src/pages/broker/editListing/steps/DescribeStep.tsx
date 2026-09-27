import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { PriceField } from '@/components/broker/PriceField';
import { AreaField } from '@/components/broker/AreaField';
import { SectionCard } from '@/components/broker/SectionCard';
import { ListingPurposeToggle } from '@/components/broker/ListingPurposeToggle';
import { PropertyTypeCardSelector } from '@/components/broker/PropertyTypeCardSelector';
import { SingleChipGroup, BHK_CHIP_OPTIONS } from '../chipGroups';
import type { DescribeStepProps } from './stepContracts';
import { AgriDetailsSection } from './describe/AgriDetailsSection';
import { ResidentialFeaturesSection } from './describe/ResidentialFeaturesSection';
import { FloorsAndFurnishingFields } from './describe/FloorsAndFurnishingFields';
import { CommercialBasicsSection } from './describe/CommercialBasicsSection';
import { CommercialSubtypeSection } from './describe/CommercialSubtypeSection';
import { RentDetailsSection } from './describe/RentDetailsSection';
import { ResidentialTermsSection } from './describe/ResidentialTermsSection';

/**
 * Step 1 ("Describe") render panel — Issue #1838 slice 6b (final panel extraction of the
 * EditListingForm decomposition programme). STATELESS: owns no state, calls none of the 5
 * domain hooks itself. EditListingForm.tsx remains the sole state owner; this component
 * receives every value/setter/handler as a prop and renders the identical JSX that used to
 * live inline in EditListingForm.tsx (lines ~601-1553 pre-extraction).
 *
 * The parent's `<div data-testid="step-1-panel" style={{ display: currentStep === 1 ? 'block'
 * : 'none' }}>` always-mounted wrapper stays in EditListingForm.tsx verbatim — this component
 * is only the wrapper's inner content (the `<form>`).
 *
 * Issue #1838 PR D — this panel's own JSX (955 LOC pre-split) was further split into 7
 * per-domain section components under ./describe/ (each a module-scope component in its
 * own file, never nested inside this function body — a component declared inside a
 * parent's render body gets a new identity every render and remounts on every keystroke
 * that triggers a re-render; see DescribeStep.structure.test.tsx's Blocker 1). This
 * component remains the sole owner of the destructuring/prop-routing that used to precede
 * the giant render block; each domain hook-result object (agri/commercial/rent/residential/
 * shared) is passed straight through to its section(s) rather than destructured here,
 * except `shared.carpetArea`/`carpetAreaUnit`, which stay inline (Carpet Area is not part
 * of any single extracted section — it renders directly under this component alongside
 * landArea/builtArea/bedrooms).
 *
 * Issue #1838 PR E — converted to the {view, commands} contract (see
 * stepContracts.ts). The 35-flat-prop surface collapses to `view`/`commands`;
 * the first lines of this function rebuild the SAME local variable names the
 * rest of the JSX below already relied on, so everything past that point
 * stays textually unchanged except: `onSubmit={commands.workflow.save}` (by
 * reference — handleStep1Save reads `e.preventDefault()`, so it must never be
 * wrapped as `() => save()`), the propertyType select's
 * `onChange={changePropertyType}`, the 3 area fields now reading a combined
 * `{value, unit}` object and calling their setter with BOTH args in one call
 * (replacing the previous 2 separate setter calls), the title input's
 * manually-edited flag now calling `markTitleManuallyEdited()`, and the
 * submit-disabled/spinner logic now reading `status.isSaving`.
 */
export function DescribeStep({ view, commands }: DescribeStepProps) {
  const { basics, dimensions, capabilities, status } = view;
  const { title, description, priceRupees, propertyType, listingPurpose, reraNumber, locality } = basics;
  const { fieldVisible, isCommercialType, commercialSubtype } = capabilities;
  const { bedrooms } = dimensions;
  const { value: landArea, unit: landAreaUnit } = dimensions.landArea;
  const { value: builtArea, unit: builtAreaUnit } = dimensions.builtArea;
  const { value: carpetArea, unit: carpetAreaUnit } = dimensions.carpetArea;
  const isSaving = status.isSaving;

  const {
    setTitle, setDescription, setLocality, setPriceRupees, setListingPurpose, setReraNumber,
    changePropertyType, markTitleManuallyEdited,
  } = commands.basics;
  const { setLandArea, setBuiltArea, setCarpetArea, setBedrooms } = commands.dimensions;
  const { save: handleStep1Save } = commands.workflow;

  // Composed hook-result-shaped objects — reassembled from view/commands so
  // every section call site below stays textually unchanged (Issue #1838
  // slice 6b — misrouting-safe by construction: agri={agri} cannot be
  // miswired, unlike passing dozens of loose scalars).
  const agri = { values: view.agri, setters: commands.agri };
  const commercial = { values: view.commercial, setters: commands.commercial };
  const rent = { values: view.rent, setters: commands.rent };
  const residential = { values: view.residential, setters: commands.residential };
  const shared = { values: view.shared, setters: commands.shared };

  return (
        <form onSubmit={handleStep1Save} className="space-y-6">
          {/* Listing basics */}
          <SectionCard title="Listing basics">
            {/* Property Type */}
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <PropertyTypeCardSelector
                id="propertyType"
                value={propertyType}
                onChange={changePropertyType}
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
              {/* Land Area — land, commercial_land, agricultural_land, and residential_plot.
                  commercial_building/warehouse also carry 'landArea' in their visibleFields
                  set (config-level), but per #2349 must NOT render it alongside Built Area —
                  CommercialListingForm.tsx (create) shows only ONE of {Land area, Built area}
                  via `isLand = commercialSubtype === 'LAND'`; commercial_building resolves to
                  'BUILDING' and warehouse to 'WAREHOUSE', so create never shows Land Area for
                  either. Suppress it ONLY for those two property types (not globally — house/
                  villa/apartment intentionally show Land Area alongside Built Area for their
                  own plot-area use case and must be unaffected) to match that contract exactly. */}
              {fieldVisible('landArea')
                && !((propertyType === 'commercial_building' || propertyType === 'warehouse') && fieldVisible('builtArea'))
                && (
                <AreaField
                  id="landArea"
                  propertyType={propertyType === 'agricultural_land' ? 'agricultural_land' : 'land'}
                  initialArea={landArea}
                  initialUnit={landAreaUnit}
                  onChange={(area, unit) => setLandArea(area, unit)}
                />
              )}

              <AgriDetailsSection agri={agri} shared={shared} fieldVisible={fieldVisible} />

              {/* Built Area — apartment, house, villa, commercial_building, warehouse.
                  AreaField's chip/unit template has no distinct 'villa' variant — villa
                  reuses the 'house' template (identical visibility set, design §3). */}
              {fieldVisible('builtArea') && (
                <AreaField
                  id="builtArea"
                  label="Built Area"
                  propertyType={isCommercialType ? 'commercial' : (propertyType === 'apartment' ? 'apartment' : 'house')}
                  initialArea={builtArea}
                  initialUnit={builtAreaUnit}
                  onChange={(area, unit) => setBuiltArea(area, unit)}
                />
              )}

              {/* Bedrooms (BHK) — apartment / house / villa. M38-13A (#1626) chip control
                  (design §1): "5+" caps the chip UI but the underlying wire value stays a
                  plain integer, unchanged for the backend. */}
              {fieldVisible('bedrooms') && (
                <SingleChipGroup
                  id="bedrooms"
                  label="Bedrooms (BHK)"
                  options={BHK_CHIP_OPTIONS}
                  value={bedrooms}
                  onValueChange={setBedrooms}
                />
              )}

              {/* Carpet Area — commercial shop/office, OR apartment primary area (M38-13A) */}
              {fieldVisible('carpetArea') && (
                <AreaField
                  id="carpetArea"
                  label="Carpet Area"
                  propertyType="commercial"
                  initialArea={carpetArea}
                  initialUnit={carpetAreaUnit}
                  onChange={(area, unit) => setCarpetArea(area, unit)}
                />
              )}

              <ResidentialFeaturesSection
                residential={residential}
                shared={shared}
                propertyType={propertyType}
                fieldVisible={fieldVisible}
              />

              <FloorsAndFurnishingFields
                shared={shared}
                propertyType={propertyType}
                isCommercialType={isCommercialType}
                fieldVisible={fieldVisible}
              />

              <CommercialBasicsSection commercial={commercial} fieldVisible={fieldVisible} />

              <CommercialSubtypeSection
                commercial={commercial}
                commercialSubtype={commercialSubtype}
                fieldVisible={fieldVisible}
              />

              <RentDetailsSection rent={rent} fieldVisible={fieldVisible} />

              <ResidentialTermsSection residential={residential} fieldVisible={fieldVisible} />

              {/* RERA Number — apartment / house / villa / residential_plot */}
              {(propertyType === 'apartment' || propertyType === 'house' || propertyType === 'villa'
                || propertyType === 'residential_plot') && (
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
                  markTitleManuallyEdited();
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
            <Button type="submit" disabled={isSaving}>
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save & Continue
            </Button>
          </div>
        </form>
  );
}
