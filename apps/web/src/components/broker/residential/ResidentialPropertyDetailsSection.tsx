import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaField } from '@/components/broker/AreaField';
import { SingleChipGroup } from '@/components/broker/ChipGroup';
import { FieldPairRow } from './FieldPairRow';
import {
  FACING_OPTIONS,
  PROPERTY_AGE_OPTIONS,
  RESIDENTIAL_WATER_SOURCE_OPTIONS,
  FURNISHING_OPTIONS,
} from '@/lib/listing-constants';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { Field, Section, BoolSwitch, CarpetAreaInput } from './ResidentialFormPrimitives';
import {
  BHK_CHIP_OPTIONS,
  BATHROOM_CHIP_OPTIONS,
  BALCONY_CHIP_OPTIONS,
  FLOORS_CHIP_OPTIONS,
} from './residentialFormConstants';

interface ResidentialPropertyDetailsSectionProps {
  isApartment: boolean;
  isHouseOrVilla: boolean;
  isPlot: boolean;
  fieldVisible: (key: ListingFieldKey) => boolean;

  carpetArea: number | null;
  carpetAreaUnit: string;
  onCarpetAreaChange: (area: number | null, unit: string) => void;
  builtArea: number | null;
  builtAreaUnit: string;
  onBuiltAreaChange: (area: number | null, unit: string) => void;
  landArea: number | null;
  landAreaUnit: string;
  onLandAreaChange: (area: number | null, unit: string) => void;

  bedrooms: string;
  onBedroomsChange: (value: string) => void;
  bathrooms: string;
  onBathroomsChange: (value: string) => void;
  balconies: string;
  onBalconiesChange: (value: string) => void;
  floorNumber: string;
  onFloorNumberChange: (value: string) => void;
  totalFloors: string;
  onTotalFloorsChange: (value: string) => void;
  furnishingStatus: string;
  onFurnishingStatusChange: (value: string) => void;
  facing: string;
  onFacingChange: (value: string) => void;
  propertyAge: string;
  onPropertyAgeChange: (value: string) => void;
  residentialWaterSource: string;
  onResidentialWaterSourceChange: (value: string) => void;
  plotDimensions: string;
  onPlotDimensionsChange: (value: string) => void;
  roadWidthFt: string;
  onRoadWidthFtChange: (value: string) => void;
  isCornerPlot: boolean | null;
  onIsCornerPlotChange: (value: boolean) => void;
  hasBoundaryWall: boolean | null;
  onHasBoundaryWallChange: (value: boolean) => void;
  isGatedLayout: boolean | null;
  onIsGatedLayoutChange: (value: boolean) => void;
  hasWaterConnection: boolean | null;
  onHasWaterConnectionChange: (value: boolean) => void;
  hasElectricityConnection: boolean | null;
  onHasElectricityConnectionChange: (value: boolean) => void;
  hasDrainage: boolean | null;
  onHasDrainageChange: (value: boolean) => void;
}

/** #2387 — Section 3: Property details (subtype-dependent core fields). Verbatim extraction, no behaviour change. */
export function ResidentialPropertyDetailsSection(props: ResidentialPropertyDetailsSectionProps) {
  const { isApartment, isHouseOrVilla, isPlot, fieldVisible } = props;
  return (
    <Section number={3} title={isPlot ? 'Plot details' : 'Property details'}>
      {isApartment && (
        <CarpetAreaInput initialArea={props.carpetArea} initialUnit={props.carpetAreaUnit} onChange={props.onCarpetAreaChange} />
      )}
      {/* Issue #2040 — moved here (was previously under the collapsed
          "More details" section, see #1722 AC8). Built-up area is
          genuinely required for apartment at submit
          (ListingTransitionPolicy.validateFields() case "apartment"), so
          it belongs in the always-visible core section, not a
          collapsed one — see the AC10 annotation in
          ResidentialListingForm.fieldGrouping.test.tsx for the full
          rationale and the superseded #1722 classification. */}
      {isApartment && fieldVisible('builtArea') && (
        <div>
          <AreaField id="builtArea" label="Built-up area" propertyType="apartment" initialArea={props.builtArea} initialUnit={props.builtAreaUnit} onChange={props.onBuiltAreaChange} />
          <p className="mt-1.5 text-xs text-muted-foreground">Required to submit this listing for review.</p>
        </div>
      )}
      {isHouseOrVilla && (
        <AreaField id="builtArea" label="Built-up area" propertyType="house" initialArea={props.builtArea} initialUnit={props.builtAreaUnit} onChange={props.onBuiltAreaChange} />
      )}
      {isPlot && (
        <AreaField id="plotArea" label="Plot area" propertyType="land" initialArea={props.landArea} initialUnit={props.landAreaUnit} onChange={props.onLandAreaChange} />
      )}

      {fieldVisible('bedrooms') && (
        <SingleChipGroup id="bedrooms" label="Configuration (BHK)" options={BHK_CHIP_OPTIONS} value={props.bedrooms} onValueChange={props.onBedroomsChange} />
      )}

      <FieldPairRow>
        {fieldVisible('bathrooms') && (
          <SingleChipGroup id="bathrooms" label="Bathrooms" options={BATHROOM_CHIP_OPTIONS} value={props.bathrooms} onValueChange={props.onBathroomsChange} />
        )}
        {fieldVisible('balconies') && (
          <SingleChipGroup id="balconies" label="Balconies" options={BALCONY_CHIP_OPTIONS} value={props.balconies} onValueChange={props.onBalconiesChange} />
        )}
      </FieldPairRow>

      {isApartment && (
        <FieldPairRow>
          {fieldVisible('floorNumber') && (
            <Field id="floorNumber" label="Floor number">
              <Input id="floorNumber" type="number" min="0" max="100" className="h-11 font-mono" value={props.floorNumber} onChange={(e) => props.onFloorNumberChange(e.target.value)} />
            </Field>
          )}
          {fieldVisible('totalFloors') && (
            <Field id="totalFloors" label="Total floors">
              <Input id="totalFloors" type="number" min="1" max="100" className="h-11 font-mono" value={props.totalFloors} onChange={(e) => props.onTotalFloorsChange(e.target.value)} />
            </Field>
          )}
        </FieldPairRow>
      )}

      <FieldPairRow>
        {fieldVisible('furnishingStatus') && (
          <SingleChipGroup id="furnishingStatus" label="Furnishing" variant="segmented" options={FURNISHING_OPTIONS} value={props.furnishingStatus} onValueChange={props.onFurnishingStatusChange} />
        )}
        {fieldVisible('facing') && (
          <Field id="facing" label="Facing">
            <Select value={props.facing} onValueChange={props.onFacingChange}>
              <SelectTrigger id="facing" className="h-11"><SelectValue placeholder="Select direction" /></SelectTrigger>
              <SelectContent>
                {FACING_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
      </FieldPairRow>

      {isHouseOrVilla && fieldVisible('totalFloors') && (
        <SingleChipGroup id="totalFloors" label="Number of floors" options={FLOORS_CHIP_OPTIONS} value={props.totalFloors} onValueChange={props.onTotalFloorsChange} />
      )}
      {isHouseOrVilla && fieldVisible('propertyAge') && (
        <Field id="propertyAge" label="Property age">
          <Select value={props.propertyAge} onValueChange={props.onPropertyAgeChange}>
            <SelectTrigger id="propertyAge" className="h-11"><SelectValue placeholder="Select property age" /></SelectTrigger>
            <SelectContent>
              {PROPERTY_AGE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {isHouseOrVilla && fieldVisible('residentialWaterSource') && (
        <Field id="residentialWaterSource" label="Water source">
          <Select value={props.residentialWaterSource} onValueChange={props.onResidentialWaterSourceChange}>
            <SelectTrigger id="residentialWaterSource" className="h-11"><SelectValue placeholder="Select water source" /></SelectTrigger>
            <SelectContent>
              {RESIDENTIAL_WATER_SOURCE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {isPlot && fieldVisible('plotDimensions') && (
        <Field id="plotDimensions" label="Plot dimensions">
          <Input id="plotDimensions" placeholder="e.g. 30x40" value={props.plotDimensions} onChange={(e) => props.onPlotDimensionsChange(e.target.value)} className="h-11" />
        </Field>
      )}
      {isPlot && fieldVisible('roadWidthFt') && (
        <Field id="roadWidthFt" label="Road width (ft)">
          <Input id="roadWidthFt" type="number" min="0" className="h-11 font-mono" value={props.roadWidthFt} onChange={(e) => props.onRoadWidthFtChange(e.target.value)} />
        </Field>
      )}
      {isPlot && (
        <div className="grid grid-cols-2 gap-3">
          {fieldVisible('isCornerPlot') && <BoolSwitch id="isCornerPlot" label="Corner plot" value={props.isCornerPlot} onChange={props.onIsCornerPlotChange} />}
          {fieldVisible('hasBoundaryWall') && <BoolSwitch id="hasBoundaryWall" label="Boundary wall" value={props.hasBoundaryWall} onChange={props.onHasBoundaryWallChange} />}
          {fieldVisible('isGatedLayout') && <BoolSwitch id="isGatedLayout" label="Gated layout" value={props.isGatedLayout} onChange={props.onIsGatedLayoutChange} />}
          {fieldVisible('hasWaterConnection') && <BoolSwitch id="hasWaterConnection" label="Water connection" value={props.hasWaterConnection} onChange={props.onHasWaterConnectionChange} />}
          {fieldVisible('hasElectricityConnection') && <BoolSwitch id="hasElectricityConnection" label="Electricity connection" value={props.hasElectricityConnection} onChange={props.onHasElectricityConnectionChange} />}
          {fieldVisible('hasDrainage') && <BoolSwitch id="hasDrainage" label="Drainage" value={props.hasDrainage} onChange={props.onHasDrainageChange} />}
        </div>
      )}
    </Section>
  );
}
