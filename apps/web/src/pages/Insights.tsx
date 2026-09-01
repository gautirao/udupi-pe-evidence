import { AppLayout } from '@/components/layout/AppLayout';
import { SavedAreas } from '@/components/insights/SavedAreas';
import { PaywallCard } from '@/components/insights/PaywallCard';
import { TrialBanner } from '@/components/insights/TrialBanner';
import { AveragePriceSection } from '@/components/insights/AveragePriceSection';
import { PriceTrendSection } from '@/components/insights/PriceTrendSection';
import { AreaComparisonSection } from '@/components/insights/AreaComparisonSection';
import { useInsightsAccess } from '@/hooks/useInsightsAccess';
import { useInsightsView } from '@/hooks/useInsightsView';

export default function Insights() {
  const { hasAccess, daysRemaining, showPaywall, showTrialBanner } = useInsightsAccess();
  const view = useInsightsView(hasAccess);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Market Insights</h1>
          <p className="text-muted-foreground mt-1">
            Price trends and area comparisons
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column - Saved Areas */}
          <div className="lg:col-span-1">
            <SavedAreas selectedArea={view.selectedArea} />
          </div>

          {/* Right column - Insights */}
          <div className="lg:col-span-2 space-y-6">
            {showTrialBanner && <TrialBanner daysRemaining={daysRemaining} />}
            {showPaywall ? (
              <PaywallCard />
            ) : (
              <>
                <AveragePriceSection
                  avgPriceData={view.avgPriceData}
                  avgPriceLoading={view.avgPriceLoading}
                  avgPriceError={view.avgPriceError}
                  avgPricePropertyType={view.avgPricePropertyType}
                  setAvgPricePropertyType={view.setAvgPricePropertyType}
                  avgPriceBedrooms={view.avgPriceBedrooms}
                  setAvgPriceBedrooms={view.setAvgPriceBedrooms}
                />

                <PriceTrendSection
                  avgPriceData={view.avgPriceData}
                  selectedArea={view.selectedArea}
                  setSelectedArea={view.setSelectedArea}
                  selectedPriceType={view.selectedPriceType}
                  setSelectedPriceType={view.setSelectedPriceType}
                  priceTrendData={view.priceTrendData}
                  trendLoading={view.trendLoading}
                  trendError={view.trendError}
                  sqftTrendData={view.sqftTrendData}
                  sqftTrendLoading={view.sqftTrendLoading}
                  sqftTrendError={view.sqftTrendError}
                />

                <AreaComparisonSection
                  avgPriceData={view.avgPriceData}
                  avgPriceLoading={view.avgPriceLoading}
                  selectedCompareAreas={view.selectedCompareAreas}
                  toggleCompareArea={view.toggleCompareArea}
                  compareAreaResults={view.compareAreaResults}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
