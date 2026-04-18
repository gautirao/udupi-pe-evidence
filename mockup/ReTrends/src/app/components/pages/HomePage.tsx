import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, MapPin, TrendingUp, Shield, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cities, mockLocalities } from '../../mockData';
import { ImageWithFallback } from '../figma/ImageWithFallback';

export function HomePage() {
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState('Bangalore');

  const handleSearch = () => {
    navigate('/discover');
  };

  const trendingLocalities = mockLocalities.filter(l => l.trending).slice(0, 3);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-blue-50 py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium mb-6">
                <TrendingUp size={16} />
                Discover smarter with verified insights
              </div>

              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                Find Your Perfect Home with{' '}
                <span className="bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
                  Trust & Clarity
                </span>
              </h1>

              <p className="text-lg text-gray-600 mb-8">
                Explore properties through interactive maps, discover localities with real market trends,
                and buy with confidence from verified listings.
              </p>

              {/* Search Box */}
              <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        City
                      </label>
                      <Select value={selectedCity} onValueChange={setSelectedCity}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {cities.map(city => (
                            <SelectItem key={city.name} value={city.name}>
                              {city.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Locality (Optional)
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <Input
                          placeholder="Search localities..."
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleSearch} size="lg" className="w-full gap-2">
                    <Search size={18} />
                    Explore on Map
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <span>500+ Verified Listings</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <span>Trusted Brokers</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=600&fit=crop"
                  alt="Modern apartment"
                  className="w-full h-[400px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="text-green-400" size={20} />
                      <span className="font-medium">Verified Property</span>
                    </div>
                    <p className="text-sm text-white/90">
                      All documents checked, RERA registered, ready to view
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Propositions */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Why Choose ReTrends?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              We're not another listings portal. We help you make informed decisions with verified data and market insights.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="text-blue-600" size={28} />
              </div>
              <h3 className="font-semibold text-lg mb-2">Map-First Discovery</h3>
              <p className="text-gray-600 text-sm">
                Explore properties by locality on an interactive map. Select up to 3 areas and see what's available instantly.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="text-green-600" size={28} />
              </div>
              <h3 className="font-semibold text-lg mb-2">Trust Signals</h3>
              <p className="text-gray-600 text-sm">
                Every listing shows verification status. Verified properties have checked documents, RERA registration, and broker credentials.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="text-purple-600" size={28} />
              </div>
              <h3 className="font-semibold text-lg mb-2">Market Insights</h3>
              <p className="text-gray-600 text-sm">
                Understand price trends, demand patterns, and locality dynamics before you decide. Data you can trust.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trending Localities */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Trending Localities in {selectedCity}
              </h2>
              <p className="text-gray-600">High demand areas with verified listings</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/trends')} className="gap-2">
              View All Trends
              <ArrowRight size={16} />
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {trendingLocalities.map(locality => (
              <div
                key={locality.name}
                onClick={() => navigate('/discover')}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                      {locality.name}
                    </h3>
                    <p className="text-sm text-gray-500">{locality.city}</p>
                  </div>
                  <div className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded font-medium">
                    Trending
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Avg. Price</span>
                    <span className="font-semibold text-gray-900">
                      ₹{(locality.avgPrice! / 10000000).toFixed(2)} Cr
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Properties</span>
                    <span className="font-semibold text-gray-900">
                      {locality.propertyCount}+
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-blue-600 font-medium group-hover:gap-3 transition-all">
                    Explore Area
                    <ArrowRight size={16} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Explanation */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-8 md:p-12">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-white rounded-xl shadow-sm">
                <Shield className="text-blue-600" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Understanding Trust Badges
                </h2>
                <p className="text-gray-600">
                  We verify every listing to help you buy with confidence
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-3">
                  <CheckCircle2 className="text-emerald-600" size={20} />
                </div>
                <h3 className="font-semibold mb-2">Verified</h3>
                <p className="text-sm text-gray-600">
                  Documents verified, RERA registered, broker credentials confirmed
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                  <Shield className="text-blue-600" size={20} />
                </div>
                <h3 className="font-semibold mb-2">Trusted</h3>
                <p className="text-sm text-gray-600">
                  From verified brokers with proven track record
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                  <MapPin className="text-gray-600" size={20} />
                </div>
                <h3 className="font-semibold mb-2">Listed</h3>
                <p className="text-sm text-gray-600">
                  Standard listing, verification in progress
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Area Overview Demo Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Area Overview Pages
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Explore detailed insights for different localities based on available data
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div
              onClick={() => navigate('/area-overview/koramangala')}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                  Koramangala
                </h3>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">
                  Full Data
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                42 listings · Comprehensive market data with trends and activity metrics
              </p>
              <div className="flex items-center gap-2 text-sm text-blue-600 font-medium group-hover:gap-3 transition-all">
                View Overview
                <ArrowRight size={16} />
              </div>
            </div>

            <div
              onClick={() => navigate('/area-overview/katapadi')}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                  Katapadi
                </h3>
                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                  Limited Data
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                9 listings · Useful insights with cautious interpretation
              </p>
              <div className="flex items-center gap-2 text-sm text-blue-600 font-medium group-hover:gap-3 transition-all">
                View Overview
                <ArrowRight size={16} />
              </div>
            </div>

            <div
              onClick={() => navigate('/area-overview/tiny-village')}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                  Tiny Village
                </h3>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                  Fallback Data
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                &lt;5 listings · District-level price context for new areas
              </p>
              <div className="flex items-center gap-2 text-sm text-blue-600 font-medium group-hover:gap-3 transition-all">
                View Overview
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-blue-600 to-blue-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Find Your Perfect Home?
          </h2>
          <p className="text-blue-100 text-lg mb-8">
            Start exploring verified properties in your preferred localities
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              variant="secondary"
              className="gap-2"
              onClick={handleSearch}
            >
              <MapPin size={18} />
              Start Map Search
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2 bg-white/10 text-white border-white/30 hover:bg-white/20"
              onClick={() => navigate('/trends')}
            >
              <TrendingUp size={18} />
              Explore Trends
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
