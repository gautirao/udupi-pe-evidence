import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { TrendingUp, TrendingDown, ArrowRight, MapPin, Activity, Shield, Calendar, Info } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { mockTrends, mockLocalities } from '../../mockData';

export function TrendsPage() {
  const navigate = useNavigate();
  const { locality: paramLocality } = useParams();
  const [selectedLocality, setSelectedLocality] = useState(paramLocality || 'Koramangala');
  const [timeRange, setTimeRange] = useState('6m');

  const trendData = mockTrends[selectedLocality];
  const localitiesWithTrends = Object.keys(mockTrends);

  if (!trendData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            No trend data available for this locality
          </h2>
          <Button onClick={() => navigate('/discover')}>
            Explore Properties
          </Button>
        </div>
      </div>
    );
  }

  const pieColors = ['#3b82f6', '#8b5cf6', '#ec4899'];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
            <button onClick={() => navigate('/')} className="hover:text-blue-600">
              Home
            </button>
            <span>/</span>
            <span>Market Trends</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Market Trends & Insights
              </h1>
              <p className="text-gray-600">
                Understand locality dynamics and market patterns to make informed decisions
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Select value={selectedLocality} onValueChange={setSelectedLocality}>
                <SelectTrigger className="w-48 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {localitiesWithTrends.map(locality => (
                    <SelectItem key={locality} value={locality}>
                      {locality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3m">3 Months</SelectItem>
                  <SelectItem value="6m">6 Months</SelectItem>
                  <SelectItem value="1y">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Price Change</span>
              {trendData.priceChange > 0 ? (
                <TrendingUp className="text-green-600" size={20} />
              ) : (
                <TrendingDown className="text-red-600" size={20} />
              )}
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {trendData.priceChange > 0 ? '+' : ''}
              {trendData.priceChange}%
            </div>
            <div className="text-xs text-gray-500 mt-1">Last 6 months</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Demand Score</span>
              <Activity className="text-blue-600" size={20} />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {trendData.demandScore}/100
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {trendData.demandScore >= 80 ? 'Very High' : trendData.demandScore >= 60 ? 'High' : 'Moderate'}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Avg. Price</span>
              <MapPin className="text-purple-600" size={20} />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              ₹{(trendData.avgPrice / 10000000).toFixed(2)} Cr
            </div>
            <div className="text-xs text-gray-500 mt-1">Current average</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Listing Quality</span>
              <Shield className="text-green-600" size={20} />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {trendData.listingQuality}%
            </div>
            <div className="text-xs text-gray-500 mt-1">Verified listings</div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          

          <TabsContent value="overview" className="space-y-6">
            {/* Key Insights */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Info className="text-blue-600" size={20} />
                Key Insights for {selectedLocality}
              </h2>
              <div className="space-y-3">
                {trendData.insights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-gray-700">{insight}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Property Type Distribution */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">
                  Popular Property Types
                </h3>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={trendData.popularTypes.map(t => ({ name: t.type, value: t.percentage }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry) => `${entry.name}: ${entry.value}%`}
                      >
                        {trendData.popularTypes.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">
                  Market Indicators
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Supply Trend</span>
                      <span className={`text-sm font-medium px-2 py-1 rounded capitalize ${
                        trendData.supplyTrend === 'increasing'
                          ? 'bg-green-100 text-green-700'
                          : trendData.supplyTrend === 'decreasing'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {trendData.supplyTrend}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {trendData.supplyTrend === 'increasing'
                        ? 'New properties entering the market'
                        : trendData.supplyTrend === 'decreasing'
                        ? 'Limited new inventory'
                        : 'Balanced supply'}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Buyer Activity</span>
                      <span className="text-sm font-medium">
                        {trendData.demandScore >= 80 ? 'Very Active' : 'Active'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      High engagement from potential buyers
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Price Momentum</span>
                      <span className={`text-sm font-medium ${
                        trendData.priceChange > 7 ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {trendData.priceChange > 7 ? 'Strong Growth' : 'Steady Growth'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Based on last 6 months of data
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-lg border border-blue-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 mb-2">
                    Ready to explore properties in {selectedLocality}?
                  </h3>
                  <p className="text-gray-600 text-sm mb-4">
                    View verified listings and find your perfect home in this locality
                  </p>
                  <Button onClick={() => navigate('/discover')} className="gap-2">
                    <MapPin size={16} />
                    Explore on Map
                    <ArrowRight size={16} />
                  </Button>
                </div>
                <div className="hidden md:block">
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
                    <TrendingUp className="text-white" size={40} />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="prices" className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                Price Movement - Last 6 Months
              </h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData.priceHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <YAxis
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      tickFormatter={(value) => `₹${(value / 10000000).toFixed(1)}Cr`}
                    />
                    <Tooltip
                      formatter={(value: number) => [`₹${(value / 10000000).toFixed(2)} Cr`, 'Avg Price']}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgPrice"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-3">
                  <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-1">What this means</p>
                    <p className="text-blue-700">
                      Prices in {selectedLocality} have {trendData.priceChange > 0 ? 'increased' : 'decreased'} by{' '}
                      <strong>{Math.abs(trendData.priceChange)}%</strong> over the last 6 months.
                      This {trendData.priceChange > 7 ? 'strong' : 'steady'} growth indicates{' '}
                      {trendData.priceChange > 7 ? 'high' : 'moderate'} demand and a healthy market.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="supply" className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Supply & Demand Analysis
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <TrendingUp size={18} />
                    Demand Indicators
                  </h3>
                  <ul className="space-y-2 text-sm text-green-800">
                    <li className="flex items-start gap-2">
                      <span className="text-green-600 mt-1">•</span>
                      <span>
                        Demand score of <strong>{trendData.demandScore}/100</strong> indicates strong buyer interest
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-600 mt-1">•</span>
                      <span>
                        High engagement from IT professionals and families
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-600 mt-1">•</span>
                      <span>
                        Properties typically receive multiple inquiries within first week
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Activity size={18} />
                    Supply Trends
                  </h3>
                  <ul className="space-y-2 text-sm text-blue-800">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span className="capitalize">
                        <strong>{trendData.supplyTrend}</strong> supply trend in the locality
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>
                        {trendData.listingQuality}% of listings meet verification standards
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>
                        {trendData.supplyTrend === 'increasing'
                          ? 'Several new projects nearing completion'
                          : 'Limited new construction, mature locality'}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Compare Localities */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Compare with Other Localities
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {localitiesWithTrends.filter(l => l !== selectedLocality).slice(0, 3).map(locality => {
              const data = mockTrends[locality];
              return (
                <button
                  key={locality}
                  onClick={() => setSelectedLocality(locality)}
                  className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-semibold text-gray-900 mb-2">{locality}</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Price:</span>
                      <span className="font-medium">₹{(data.avgPrice / 10000000).toFixed(2)} Cr</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Growth:</span>
                      <span className={`font-medium ${data.priceChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {data.priceChange > 0 ? '+' : ''}{data.priceChange}%
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
