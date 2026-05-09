import { useParams, useNavigate, Link } from 'react-router';
import { ArrowRight, Info, MapPin, TrendingUp, School, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { areaOverviewData } from '../../areaOverviewData';

export function AreaOverviewPage() {
  const { locality } = useParams();
  const navigate = useNavigate();

  const data = areaOverviewData[locality || 'koramangala'];

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Area not found</h2>
          <Button onClick={() => navigate('/')}>Back to Home</Button>
        </div>
      </div>
    );
  }

  const { area, district, city, dataBasis, priceOverview, marketActivity, comparison, schools, state } = data;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto px-4" style={{ maxWidth: '1280px' }}>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <Link to="/" className="hover:text-blue-600">Home</Link>
          <ChevronRight size={14} />
          <Link to="/area-overview" className="hover:text-blue-600">Area Overview</Link>
          <ChevronRight size={14} />
          <span className="text-gray-900">{area}</span>
        </div>

        {/* Area Header */}
        <div className="mb-6">
          <h1 className="text-[32px] font-bold text-gray-900 mb-2">{area}</h1>
          <p className="text-gray-600">
            {city ? `${city} · ${district}` : district}
          </p>
          <p className={`text-sm mt-2 ${state === 'limited' ? 'text-amber-700' : 'text-gray-500'}`}>
            {dataBasis}
          </p>
        </div>

        {/* Fallback Notice */}
        {state === 'fallback' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-blue-900">
              Showing price overview for {district}. This locality has fewer than 5 listings on the platform.
            </p>
          </div>
        )}

        {/* Price Overview Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            {state === 'fallback' ? `${district} — price overview` : 'Price overview'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600 mb-1">Median price</div>
              <div className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {priceOverview.medianPrice}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Price range</div>
              <div className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {priceOverview.priceRange}
              </div>
            </div>
            {priceOverview.trend && (
              <div>
                <div className="text-sm text-gray-600 mb-1">Trend</div>
                <div className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  {priceOverview.trend.includes('rising') ? (
                    <TrendingUp className="text-green-600" size={20} />
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  <span className="text-base">{priceOverview.trend}</span>
                </div>
              </div>
            )}
            {priceOverview.propertyMix && (
              <div>
                <div className="text-sm text-gray-600 mb-2">Property mix</div>
                <div className="space-y-1.5">
                  {priceOverview.propertyMix.map((mix, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${mix.percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-20 text-right">
                        {mix.type} {mix.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Market Activity Card */}
        {marketActivity && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Market activity</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-gray-600 mb-1">Active listings</div>
                <div className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {marketActivity.activeListings}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">New this month</div>
                <div className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {marketActivity.newThisMonth}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comparison Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Compare with nearby localities</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Locality</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Median price</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Listings (90 days)</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Trend</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-gray-100 ${
                      row.isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <span className={row.isCurrent ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                        {row.locality}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.medianPrice}
                    </td>
                    <td className="py-3 px-4 text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.listings}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-sm ${
                        row.trend.includes('↑') ? 'text-green-700' :
                        row.trend.includes('↓') ? 'text-red-700' :
                        'text-gray-600'
                      }`}>
                        {row.trend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Schools Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Schools nearby</h2>
          <div className="space-y-3">
            {schools.map((school, idx) => (
              <div key={idx} className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <School className="text-gray-400" size={16} />
                    <span className="font-medium text-gray-900">{school.name}</span>
                    {school.notable && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                        Notable
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 ml-6">
                    {school.board} {school.metadata && `· ${school.metadata}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Explore Map CTA */}
        <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-lg border border-blue-200 p-8 text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Ready to explore properties {state === 'fallback' ? 'near' : 'in'} {area}?
          </h3>
          <p className="text-gray-600 mb-6">
            {state === 'fallback'
              ? 'Browse verified listings in the surrounding area.'
              : 'View verified listings in this locality on the map.'}
          </p>
          <Button onClick={() => navigate('/discover')} size="lg" className="gap-2">
            <MapPin size={18} />
            Explore on Map
            <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
