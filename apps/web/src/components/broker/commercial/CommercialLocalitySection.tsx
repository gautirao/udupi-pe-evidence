import { Input } from '@/components/ui/input';
import { AddressSearch } from '@/components/broker/residential/AddressSearch';
import type { UseResidentialLocationResult } from '@/components/broker/residential/useResidentialLocation';
import { Field, Section } from './CommercialFormPrimitives';

export interface CommercialLocalitySectionProps {
  residentialLocationValue: UseResidentialLocationResult | null;
  locality: string;
  title: string;
  onTitleChange: (v: string) => void;
  hasAttempted: boolean;
}

/** #2388 — Section 2: locality/address search + listing title. */
export function CommercialLocalitySection({ residentialLocationValue, locality, title, onTitleChange, hasAttempted }: CommercialLocalitySectionProps) {
  return (
    <Section number={2} title="Where is it?">
      <Field id="locality" label="Locality / area *">
        {residentialLocationValue && <AddressSearch location={residentialLocationValue} />}
        {hasAttempted && !locality.trim() && <p className="text-sm text-destructive">Locality is required.</p>}
      </Field>

      <Field id="title" label="Listing title *" hint="Buyers see this first">
        <Input id="title" placeholder="e.g. 500 sqft Shop in Udupi Town" value={title} onChange={(e) => onTitleChange(e.target.value)} className="h-11" />
        {hasAttempted && !title.trim() && <p className="text-sm text-destructive">Title is required.</p>}
      </Field>
    </Section>
  );
}
