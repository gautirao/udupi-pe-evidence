import { Label } from '@/components/ui/label';

/**
 * Issue #2398 — page-health decomposition: small presentational primitives
 * shared across the agricultural section components. Mirrors
 * ResidentialFormPrimitives.tsx (#2387) / CommercialFormPrimitives.tsx
 * (#2388). Verbatim extraction from AgriculturalListingForm.tsx — no
 * behaviour change.
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
