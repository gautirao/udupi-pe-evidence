import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { Bookmark, MapPin, Search, Trash2, Bell, BellOff, TrendingUp, Home } from 'lucide-react';
import { Button } from '../ui/button';
import { mockSavedSearches } from '../../mockData';

export function SavedSearchesPage() {
  const navigate = useNavigate();
  const { isSignedIn, setShowSignIn } = useOutletContext<{
    isSignedIn: boolean;
    setShowSignIn: (show: boolean) => void;
  }>();

  const [savedSearches, setSavedSearches] = useState(isSignedIn ? mockSavedSearches : []);
  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    savedSearches.reduce((acc, search) => ({ ...acc, [search.id]: true }), {})
  );

  const formatPrice = (price: number) => {
    return `₹${(price / 10000000).toFixed(1)} Cr`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleDeleteSearch = (id: string) => {
    setSavedSearches(savedSearches.filter(s => s.id !== id));
  };

  const toggleNotifications = (id: string) => {
    setNotifications(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleViewSearch = (search: typeof savedSearches[0]) => {
    navigate('/discover');
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Bookmark className="text-blue-600" size={40} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Save Your Favorite Searches
          </h2>
          <p className="text-gray-600 mb-6">
            Sign in to save your property searches and get instant notifications when new listings match your preferences.
          </p>
          <Button onClick={() => setShowSignIn(true)} size="lg" className="gap-2">
            Sign In to Continue
          </Button>
        </div>
      </div>
    );
  }

  if (savedSearches.length === 0) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Bookmark className="text-gray-400" size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              No Saved Searches Yet
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Start exploring properties and save your searches to track new listings in your preferred localities.
            </p>

            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-8">
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-left">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Search className="text-blue-600" size={24} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">How to Save a Search</h3>
                <ol className="text-sm text-gray-600 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-medium">1.</span>
                    <span>Go to Map Discovery</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-medium">2.</span>
                    <span>Select localities and apply filters</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-medium">3.</span>
                    <span>Click "Save Search" button</span>
                  </li>
                </ol>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6 text-left">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Bell className="text-green-600" size={24} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Get Instant Alerts</h3>
                <p className="text-sm text-gray-600">
                  Once you save a search, you'll receive notifications when new properties matching your criteria are listed.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={() => navigate('/discover')} size="lg" className="gap-2">
                <MapPin size={18} />
                Start Exploring
              </Button>
              <Button onClick={() => navigate('/trends')} variant="outline" size="lg" className="gap-2">
                <TrendingUp size={18} />
                View Trends
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Saved Searches</h1>
          <p className="text-gray-600">
            Track your saved searches and get notified about new properties
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Bell className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm">
              <p className="font-medium text-blue-900 mb-1">Stay Updated</p>
              <p className="text-blue-700">
                You'll receive notifications when new properties matching your saved searches are listed.
                Manage notifications for each search below.
              </p>
            </div>
          </div>
        </div>

        {/* Saved Searches Grid */}
        <div className="grid gap-6">
          {savedSearches.map(search => (
            <div
              key={search.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {search.localities.join(', ')}
                    </h3>
                    {search.matchCount > 0 && (
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                        {search.matchCount} matches
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={14} className="text-gray-400" />
                    <span>{search.city}</span>
                    <span className="text-gray-400">•</span>
                    <span>Saved on {formatDate(search.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleNotifications(search.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      notifications[search.id]
                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={notifications[search.id] ? 'Notifications on' : 'Notifications off'}
                  >
                    {notifications[search.id] ? <Bell size={18} /> : <BellOff size={18} />}
                  </button>
                  <button
                    onClick={() => handleDeleteSearch(search.id)}
                    className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors"
                    title="Delete search"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Filters Summary */}
              <div className="flex flex-wrap gap-2 mb-4">
                {search.filters.priceRange && (
                  <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200">
                    {formatPrice(search.filters.priceRange.min)} - {formatPrice(search.filters.priceRange.max)}
                  </div>
                )}
                {search.filters.bedrooms && search.filters.bedrooms.length > 0 && (
                  <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200">
                    {search.filters.bedrooms.join(', ')} BHK
                  </div>
                )}
                {search.filters.propertyTypes && search.filters.propertyTypes.length > 0 && (
                  <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200 capitalize">
                    {search.filters.propertyTypes.join(', ')}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <Button
                  onClick={() => handleViewSearch(search)}
                  className="gap-2"
                  size="sm"
                >
                  <MapPin size={14} />
                  View on Map
                </Button>
                <Button
                  onClick={() => navigate(`/trends/${search.localities[0]}`)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <TrendingUp size={14} />
                  View Trends
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 bg-gradient-to-br from-blue-50 to-green-50 rounded-lg border border-blue-200 p-8 text-center">
          <div className="max-w-2xl mx-auto">
            <Home className="text-blue-600 mx-auto mb-4" size={48} />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Looking for more properties?
            </h3>
            <p className="text-gray-600 mb-6">
              Continue exploring and save more searches to find your perfect home
            </p>
            <Button onClick={() => navigate('/discover')} size="lg" className="gap-2">
              <Search size={18} />
              Explore More Properties
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
