import { ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MultiChipGroup } from '@/components/broker/ChipGroup';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { Field, SectionHeader } from './AgriculturalFormPrimitives';
import {
  WATER_SOURCE_OPTIONS,
  SOIL_TYPE_OPTIONS,
  ROAD_ACCESS_OPTIONS,
  CULTIVATION_STATUS_OPTIONS,
  CROP_OPTIONS,
  FEATURE_OPTIONS,
} from './agriculturalFormConstants';

interface AgriculturalLandCharacteristicsSectionProps {
  fieldVisible: (key: ListingFieldKey) => boolean;
  waterSource: string;
  onWaterSourceChange: (value: string) => void;
  soilType: string;
  onSoilTypeChange: (value: string) => void;
  roadAccess: string;
  onRoadAccessChange: (value: string) => void;
  cultivationStatus: string;
  onCultivationStatusChange: (value: string) => void;
  crops: string[];
  onCropsChange: (value: string[]) => void;
  features: string[];
  onFeaturesChange: (value: string[]) => void;
}

/** #2398 — Section 3: "Water, cultivation & suitability" (collapsible, defaultOpen). Verbatim extraction, no behaviour change. */
export function AgriculturalLandCharacteristicsSection({
  fieldVisible,
  waterSource,
  onWaterSourceChange,
  soilType,
  onSoilTypeChange,
  roadAccess,
  onRoadAccessChange,
  cultivationStatus,
  onCultivationStatusChange,
  crops,
  onCropsChange,
  features,
  onFeaturesChange,
}: AgriculturalLandCharacteristicsSectionProps) {
  return (
    <Collapsible defaultOpen>
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between text-left">
            <SectionHeader number={3} title="Water, cultivation & suitability" />
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform" aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-1">
          {fieldVisible('waterSource') && (
            <Field id="waterSource" label="Water source">
              <Select value={waterSource} onValueChange={onWaterSourceChange}>
                <SelectTrigger id="waterSource" className="h-11"><SelectValue placeholder="Select water source" /></SelectTrigger>
                <SelectContent>
                  {WATER_SOURCE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {fieldVisible('soilType') && (
            <Field id="soilType" label="Soil type">
              <Select value={soilType} onValueChange={onSoilTypeChange}>
                <SelectTrigger id="soilType" className="h-11"><SelectValue placeholder="Select soil type" /></SelectTrigger>
                <SelectContent>
                  {SOIL_TYPE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {fieldVisible('roadAccess') && (
            <Field id="roadAccess" label="Road access">
              <Select value={roadAccess} onValueChange={onRoadAccessChange}>
                <SelectTrigger id="roadAccess" className="h-11"><SelectValue placeholder="Select road access" /></SelectTrigger>
                <SelectContent>
                  {ROAD_ACCESS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {fieldVisible('cultivationStatus') && (
            <Field id="cultivationStatus" label="Cultivation status">
              <Select value={cultivationStatus} onValueChange={onCultivationStatusChange}>
                <SelectTrigger id="cultivationStatus" className="h-11"><SelectValue placeholder="Select cultivation status" /></SelectTrigger>
                <SelectContent>
                  {CULTIVATION_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <MultiChipGroup testId="chip-group-crops" label="Crops grown / suitable for" options={CROP_OPTIONS} value={crops} onValueChange={onCropsChange} />
          <MultiChipGroup testId="chip-group-features" label="On-land features" options={FEATURE_OPTIONS} value={features} onValueChange={onFeaturesChange} />
          <p className="text-xs text-muted-foreground" data-testid="crops-saved-features-not-saved-note">
            Crops you select are saved with your listing. Features aren't saved as structured listing data yet — they're added to your description below so buyers can still see them.
          </p>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
