import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * #2387 — page-health decomposition: small presentational primitives shared
 * across the residential section components. Mirrors
 * CommercialFormPrimitives.tsx (#2388). Verbatim extraction from
 * ResidentialListingForm.tsx — no behaviour change.
 */

interface FieldProps {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}

export function Field({ id, label, children, hint }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface SectionHeaderProps {
  number: number;
  title: string;
}

export function SectionHeader({ number, title }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-mono text-[13px] font-bold text-primary">
        {number}
      </span>
      <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
    </div>
  );
}

interface SectionProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

export function Section({ number, title, children }: SectionProps) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <SectionHeader number={number} title={title} />
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Tri-state Yes/No switch — undefined = not specified (omitted from payload). */
export function BoolSwitch({ id, label, value, onChange }: { id: string; label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Switch id={id} checked={value === true} onCheckedChange={onChange} />
    </div>
  );
}

interface CarpetAreaInputProps {
  initialArea: number | null;
  initialUnit: string;
  onChange: (area: number | null, unit: string) => void;
}

/**
 * Carpet area — plain input + unit dropdown, no quick-pick preset chips
 * (issue #1722 correction #3 — design parity with create-residential-listing.html
 * §3 "Property details"). Deliberately NOT AreaField (which always renders
 * preset chips) — AreaField is shared with other property types/flows
 * (commercial, land) that are out of scope for this fix, so it stays untouched.
 */
export function CarpetAreaInput({ initialArea, initialUnit, onChange }: CarpetAreaInputProps) {
  const [text, setText] = useState(initialArea != null ? String(initialArea) : '');
  const [unit, setUnit] = useState(initialUnit);

  const handleTextChange = (raw: string) => {
    setText(raw);
    const num = raw.trim() !== '' ? parseFloat(raw) : null;
    onChange(num != null && !isNaN(num) && num > 0 ? num : null, unit);
  };

  const handleUnitChange = (newUnit: string) => {
    setUnit(newUnit);
    const num = text.trim() !== '' ? parseFloat(text) : null;
    onChange(num != null && !isNaN(num) && num > 0 ? num : null, newUnit);
  };

  return (
    <Field id="carpetArea" label="Carpet area">
      <div className="flex gap-2">
        <Input
          id="carpetArea"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="e.g. 1150"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="h-11 flex-1"
        />
        <Select value={unit} onValueChange={handleUnitChange}>
          <SelectTrigger className="h-11 w-28" aria-label="Carpet area unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sqft">Sq.ft</SelectItem>
            <SelectItem value="sqm">Sq.m</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

