import { Input } from '@/components/ui/input';
import { AddressSearch } from './AddressSearch';
import type { UseResidentialLocationResult } from './useResidentialLocation';
import { Field, Section } from './ResidentialFormPrimitives';

interface ResidentialLocalitySectionProps {
  residentialLocationValue: UseResidentialLocationResult | null;
  locality: string;
  isPlot: boolean;
  projectName: string;
  onProjectNameChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  hasAttempted: boolean;
}

/** #2387 — Section 2: "Where is it?" (locality/project/title). Verbatim extraction, no behaviour change. */
export function ResidentialLocalitySection({ residentialLocationValue, locality, isPlot, projectName, onProjectNameChange, title, onTitleChange, hasAttempted }: ResidentialLocalitySectionProps) {
  return (
    <Section number={2} title="Where is it?">
      <Field id="locality" label="Locality / area *">
        {/* Issue #2039 (fix cycle 2) — residentialLocationValue is null only
            for the single render before ResidentialLocationBridge's mount
            effect first fires (flushed synchronously within the same
            commit/act() in practice); guards against a null `location` prop. */}
        {residentialLocationValue && <AddressSearch location={residentialLocationValue} />}
        {hasAttempted && !locality.trim() && <p className="text-sm text-destructive">Locality is required.</p>}
      </Field>

      {!isPlot && (
        <Field id="projectName" label="Project / society name">
          <Input id="projectName" placeholder="e.g. Green Meadows" value={projectName} onChange={(e) => onProjectNameChange(e.target.value)} className="h-11" />
        </Field>
      )}

      <Field id="title" label="Listing title *" hint="Buyers see this first">
        <Input id="title" placeholder={isPlot ? 'e.g. 5 cent residential plot in Manipal' : 'e.g. 3 BHK Apartment in Manipal'} value={title} onChange={(e) => onTitleChange(e.target.value)} className="h-11" />
        {hasAttempted && !title.trim() && <p className="text-sm text-destructive">Title is required.</p>}
      </Field>
    </Section>
  );
}
