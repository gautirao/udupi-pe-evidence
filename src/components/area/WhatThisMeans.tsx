import { CheckCircle, AlertTriangle } from 'lucide-react';
import { AreaIntelligenceMetrics } from '@/hooks/useAreaIntelligence';

interface WhatThisMeansProps {
  metrics: AreaIntelligenceMetrics;
  areaLabel: string;
  /** top-level API priceComparison.wording — rendered verbatim when present (AC12: no above/below hardening) */
  priceComparisonWording: string | null;
}

/**
 * 'What this means for you' section (AC6).
 * Translates ONLY present, verified metrics into conservative buyer-safe
 * Good-to-know / Worth-checking guidance.
 * No advice on whether to buy, no invented metrics (AC12).
 */
export function WhatThisMeans({
  metrics,
  areaLabel,
  priceComparisonWording,
}: WhatThisMeansProps) {
  // Build Good-to-know bullets only from present verified values (AC6)
  const goodToKnow: string[] = [];
  const worthChecking: string[] = [];

  if (metrics.activeListingCount.value !== null) {
    goodToKnow.push(
      `There are currently ${metrics.activeListingCount.value} active listings available in ${areaLabel}.`,
    );
  }

  if (metrics.medianPricePaise.value !== null) {
    // Use helper language, not above/below hardening (AC12)
    goodToKnow.push(
      'Listing prices here span a range — the typical price shown reflects the midpoint of current options.',
    );
  }

  if (metrics.avgListingQuality.value !== null) {
    const quality = Number(metrics.avgListingQuality.value);
    if (quality >= 70) {
      goodToKnow.push(
        'Listing details in this area look reasonably complete, so comparing options should be easier.',
      );
    } else {
      worthChecking.push(
        'Some listings in this area may have limited detail — check photos and location before visiting.',
      );
    }
  }

  if (metrics.freshListingCount.value !== null && metrics.freshListingCount.value > 0) {
    goodToKnow.push(
      `${metrics.freshListingCount.value} listings were recently added or updated — worth checking for new options.`,
    );
  }

  // Price comparison wording — verbatim from API, no hardening (AC12)
  if (priceComparisonWording) {
    worthChecking.push(priceComparisonWording);
  }

  // AC6 guard: if no verified data drove any bullet, render nothing.
  // The two static worth-checking bullets only appear alongside real verified content —
  // they must NOT stand alone for an all-null / no-snapshot fixture.
  const hasVerifiedContent = goodToKnow.length > 0 || worthChecking.length > 0;
  if (!hasVerifiedContent) {
    return null;
  }

  // Static worth-checking copy — appended only when there IS verified content (AC6)
  worthChecking.push(
    'For land, confirm road access, water source and exact distance from key landmarks before visiting.',
  );
  worthChecking.push(
    'Some listings may show only an approximate location — verify the exact spot with the seller.',
  );

  return (
    <section aria-labelledby="what-this-means-heading" className="space-y-4">
      <div>
        <h2
          id="what-this-means-heading"
          className="text-2xl font-bold text-slate-900 font-serif"
        >
          What this means for you
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          A plain-English read on the area, based only on what we can verify — not advice on
          whether to buy.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Good to know */}
        {goodToKnow.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <p className="font-semibold text-emerald-900 text-sm">Good to know</p>
            </div>
            <ul className="space-y-2">
              {goodToKnow.map((point, i) => (
                <li key={i} className="text-sm text-emerald-800 leading-relaxed pl-2 border-l-2 border-emerald-200">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Worth checking */}
        {worthChecking.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="font-semibold text-amber-900 text-sm">Worth checking</p>
            </div>
            <ul className="space-y-2">
              {worthChecking.map((point, i) => (
                <li key={i} className="text-sm text-amber-800 leading-relaxed pl-2 border-l-2 border-amber-200">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
