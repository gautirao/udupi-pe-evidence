import { Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AddressSearch } from '@/components/broker/residential/AddressSearch';
import type { UseResidentialLocationResult } from '@/components/broker/residential/useResidentialLocation';
import { Field, Section } from './AgriculturalFormPrimitives';

interface AgriculturalLocalitySectionProps {
  residentialLocation: UseResidentialLocationResult;
  locality: string;
  title: string;
  onTitleChange: (value: string) => void;
  hasAttempted: boolean;
  onSwitchToGenericFlow: () => void;
}

/** #2398 — Section 1: "Where is it?" (switch-flow banner, locality search, title). Verbatim extraction, no behaviour change. */
export function AgriculturalLocalitySection({ residentialLocation, locality, title, onTitleChange, hasAttempted, onSwitchToGenericFlow }: AgriculturalLocalitySectionProps) {
  return (
    <Section number={1} title="Where is it?">
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Residential &amp; commercial listings use a separate flow.</span>
        <button
          type="button"
          onClick={onSwitchToGenericFlow}
          className="ml-auto shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
        >
          Switch flow
        </button>
      </div>

      <Field id="locality" label="Locality / village *">
        <AddressSearch location={residentialLocation} />
        {hasAttempted && !locality.trim() && <p className="text-sm text-destructive">Locality is required.</p>}
      </Field>

      <Field id="title" label="Listing title" hint="Buyers see this first">
        <Input id="title" placeholder="e.g. 2.5 Acre Farmland in Hejamadi" value={title} onChange={(e) => onTitleChange(e.target.value)} className="h-11" />
      </Field>
    </Section>
  );
}
