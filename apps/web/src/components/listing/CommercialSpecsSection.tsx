import { Building2 } from 'lucide-react';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import {
  buildCommercialDetailModel,
  type CommercialDetailSubtype,
  type CommercialFact,
} from './commercialDetailModel';

/**
 * Issue #2432 — the Commercial fact section on authenticated buyer listing detail.
 *
 * Renders the groups produced by {@link buildCommercialDetailModel}. All gating, label resolution
 * and null-handling live in that pure model; this component only lays the result out, so the
 * subtype matrix is tested against the model rather than against six renders.
 *
 * Reuses the existing detail card and row shapes (rounded-2xl bordered section, dotted-leader rows)
 * rather than introducing a parallel visual system. No new colour, spacing or type scale.
 */

interface FactRowProps {
  fact: CommercialFact;
}

function FactRow({ fact }: FactRowProps) {
  return (
    <div
      data-testid={`commercial-fact-${fact.key}`}
      className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground shrink-0">{fact.label}</span>
      <span className="flex-1 min-w-0 border-b border-dashed border-border self-end mb-[3px] mx-1" />
      <span className="font-bold text-foreground shrink-0">{fact.value}</span>
    </div>
  );
}

export interface CommercialSpecsSectionProps {
  listing: PublicListingDetail;
  /**
   * The resolved buyer subtype from the #2458 contract, or `null` for a legacy commercial row that
   * never recorded one. Passed in rather than derived — see the seam note on the model module.
   */
  subtype: CommercialDetailSubtype | null;
}

export function CommercialSpecsSection({ listing, subtype }: CommercialSpecsSectionProps) {
  const groups = buildCommercialDetailModel(listing, subtype);
  if (!groups.length) return null;

  // Attribution is stated once for the section rather than repeated on each row: a per-row caveat
  // reads as a warning about that specific figure, when the point is simply that these are the
  // lister's own statements and this app has not verified them.
  const hasAttributed = groups.some((g) => g.facts.some((f) => f.attributed));

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 md:p-6"
      data-testid="commercial-specs-section"
    >
      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
        <Building2 className="h-5 w-5 text-foreground/60" />
        Commercial details
      </h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Fields that don't apply to this property, or that the lister left blank, are hidden.
      </p>

      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.key} data-testid={`commercial-group-${g.key}`}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{g.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.facts.map((f) => (
                <FactRow key={f.key} fact={f} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasAttributed && (
        <p className="mt-5 text-xs text-muted-foreground" data-testid="commercial-attribution-note">
          Zoning, ownership, approvals, income, yield and suitable uses are as stated by the lister
          and have not been independently verified.
        </p>
      )}
    </section>
  );
}
