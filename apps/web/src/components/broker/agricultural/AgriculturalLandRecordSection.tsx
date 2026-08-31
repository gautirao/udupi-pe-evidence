import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import { Field, SectionHeader } from './AgriculturalFormPrimitives';
import {
  OWNERSHIP_TYPE_OPTIONS,
  LAND_CATEGORY_OPTIONS,
  AGRI_CONVERSION_STATUS_OPTIONS,
} from './agriculturalFormConstants';

interface AgriculturalLandRecordSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldVisible: (key: ListingFieldKey) => boolean;
  landCategory: string;
  onLandCategoryChange: (value: string) => void;
  agriConversionStatus: string;
  onAgriConversionStatusChange: (value: string) => void;
  ownershipType: string;
  onOwnershipTypeChange: (value: string) => void;
  surveyNumber: string;
  onSurveyNumberChange: (value: string) => void;
  rtc: string;
  onRtcChange: (value: string) => void;
  farmhouseAvailable: string;
  onFarmhouseAvailableChange: (value: string) => void;
  fencingDone: string;
  onFencingDoneChange: (value: string) => void;
}

/** #2398 — Section 4: "Land record details" (collapsible, collapsed by default). Verbatim extraction, no behaviour change. */
export function AgriculturalLandRecordSection({
  open,
  onOpenChange,
  fieldVisible,
  landCategory,
  onLandCategoryChange,
  agriConversionStatus,
  onAgriConversionStatusChange,
  ownershipType,
  onOwnershipTypeChange,
  surveyNumber,
  onSurveyNumberChange,
  rtc,
  onRtcChange,
  farmhouseAvailable,
  onFarmhouseAvailableChange,
  fencingDone,
  onFencingDoneChange,
}: AgriculturalLandRecordSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between text-left">
            <SectionHeader number={4} title="Land record details" />
            <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-1">
          <p className="text-xs text-muted-foreground">
            Seller / broker-provided details — shown exactly as entered, never platform-verified.
          </p>
          {fieldVisible('landCategory') && (
            <Field id="landCategory" label="Land category">
              <Select value={landCategory} onValueChange={onLandCategoryChange}>
                <SelectTrigger id="landCategory" className="h-11"><SelectValue placeholder="Select land category" /></SelectTrigger>
                <SelectContent>
                  {LAND_CATEGORY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {fieldVisible('agriConversionStatus') && (
            <Field
              id="agriConversionStatus"
              label="Conversion status (optional)"
              hint="Declared by the seller/broker — not verified by ReTrends."
            >
              <Select value={agriConversionStatus} onValueChange={onAgriConversionStatusChange}>
                <SelectTrigger id="agriConversionStatus" className="h-11"><SelectValue placeholder="Select conversion status" /></SelectTrigger>
                <SelectContent>
                  {AGRI_CONVERSION_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {fieldVisible('ownershipType') && (
            <Field id="ownershipType" label="Ownership type">
              <Select value={ownershipType} onValueChange={onOwnershipTypeChange}>
                <SelectTrigger id="ownershipType" className="h-11"><SelectValue placeholder="Select ownership type" /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIP_TYPE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {fieldVisible('surveyNumber') && (
            <Field id="surveyNumber" label="Survey number">
              <Input id="surveyNumber" maxLength={64} placeholder="e.g. 123/4A" value={surveyNumber} onChange={(e) => onSurveyNumberChange(e.target.value)} className="h-11" />
            </Field>
          )}
          <Field id="rtc" label="RTC number" hint="Not yet saved as structured data — folded into your description below.">
            <Input id="rtc" maxLength={64} placeholder="e.g. RTC-2024-00123" value={rtc} onChange={(e) => onRtcChange(e.target.value)} className="h-11" />
          </Field>
          {(fieldVisible('farmhouseAvailable') || fieldVisible('fencingDone')) && (
            <div className="grid grid-cols-2 gap-4">
              {fieldVisible('farmhouseAvailable') && (
                <Field id="farmhouseAvailable" label="Farmhouse available">
                  <Select value={farmhouseAvailable} onValueChange={onFarmhouseAvailableChange}>
                    <SelectTrigger id="farmhouseAvailable" className="h-11"><SelectValue placeholder="Not specified" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {fieldVisible('fencingDone') && (
                <Field id="fencingDone" label="Fencing done">
                  <Select value={fencingDone} onValueChange={onFencingDoneChange}>
                    <SelectTrigger id="fencingDone" className="h-11"><SelectValue placeholder="Not specified" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
