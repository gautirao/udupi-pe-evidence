import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { MapPin, X, TrendingUp, SlidersHorizontal, Maximize2, Bookmark, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';
import { Checkbox } from '../ui/checkbox';
import { Slider } from '../ui/slider';
import { PropertyCard } from '../shared/PropertyCard';
import { cities, mockLocalities, mockProperties } from '../../mockData';

export function MapDiscoveryPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useOutletContext<{ isSignedIn: boolean }>();
  const [selectedCity, setSelectedCity] = useState('Bangalore');
  const [selectedLocalities, setSelectedLocalities] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState([0, 50000000]);
  const [bedrooms, setBedrooms] = useState<number[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [mapFitToSelection, setMapFitToSelection] = useState(false);

  const cityLocalities = mockLocalities.filter(l => l.city === selectedCity);
  const nearbyLocalities = selectedLocalities.length > 0
    ? cityLocalities.filter(l => !selectedLocalities.includes(l.name)).slice(0, 3)
    : [];

  const filteredProperties = mockProperties.filter(p => {
    if (p.city !== selectedCity) return false;
    if (selectedLocalities.length > 0 && !selectedLocalities.includes(p.locality)) return false;
    if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
    if (bedrooms.length > 0 && !bedrooms.includes(p.bedrooms)) return false;
    if (propertyTypes.length > 0 && !propertyTypes.includes(p.type)) return false;
    return true;
  });

  const toggleLocality = (localityName: string) => {
    if (selectedLocalities.includes(localityName)) {
      setSelectedLocalities(selectedLocalities.filter(l => l !== localityName));
    } else if (selectedLocalities.length < 3) {
      setSelectedLocalities([...selectedLocalities, localityName]);
      setMapFitToSelection(true);
    }
  };

  const toggleBedroom = (bedroom: number) => {
    if (bedrooms.includes(bedroom)) {
      setBedrooms(bedrooms.filter(b => b !== bedroom));
    } else {
      setBedrooms([...bedrooms, bedroom]);
    }
  };

  const togglePropertyType = (type: string) => {
    if (propertyTypes.includes(type)) {
      setPropertyTypes(propertyTypes.filter(t => t !== type));
    } else {
      setPropertyTypes([...propertyTypes, type]);
    }
  };

  const formatPrice = (price: number) => {
    return `₹${(price / 10000000).toFixed(1)} Cr`;
  };

  useEffect(() => {
    if (mapFitToSelection) {
      setTimeout(() => setMapFitToSelection(false), 500);
    }
  }, [mapFitToSelection]);

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      {/* Map Section */}
      <div className="lg:w-1/2 h-64 lg:h-full bg-gray-100 relative order-2 lg:order-1">
        {/* Mock Map */}
        <div className="w-full h-full bg-gradient-to-br from-blue-50 to-green-50 relative overflow-hidden">
          {/* Map Grid Pattern */}
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-10 grid-rows-10 h-full w-full">
              {Array.from({ length: 100 }).map((_, i) => (
                <div key={i} className="border border-gray-300" />
              ))}
            </div>
          </div>

          {/* City Label */}
          <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md px-3 py-2">
            <div className="flex items-center gap-2">
              <MapPin className="text-blue-600" size={16} />
              <span className="font-semibold text-sm">{selectedCity}</span>
            </div>
          </div>

          {/* City Switcher */}
          <div className="absolute top-4 right-4 w-48">
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="bg-white shadow-md">
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

          {/* Locality Markers */}
          {cityLocalities.slice(0, 6).map((locality, idx) => {
            const isSelected = selectedLocalities.includes(locality.name);
            const positions = [
              { top: '25%', left: '30%' },
              { top: '35%', left: '60%' },
              { top: '50%', left: '40%' },
              { top: '60%', left: '70%' },
              { top: '70%', left: '25%' },
              { top: '45%', left: '55%' },
            ];
            const pos = positions[idx];

            return (
              <div
                key={locality.name}
                className={`absolute cursor-pointer transition-all ${
                  mapFitToSelection && isSelected ? 'animate-pulse' : ''
                }`}
                style={pos}
                onClick={() => toggleLocality(locality.name)}
              >
                <div
                  className={`px-3 py-2 rounded-lg shadow-lg transition-all transform hover:scale-105 ${
                    isSelected
                      ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                      : 'bg-white text-gray-900 hover:bg-blue-50'
                  }`}
                >
                  <div className="font-semibold text-sm whitespace-nowrap">
                    {locality.name}
                  </div>
                  <div className={`text-xs ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                    {locality.propertyCount} properties
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Fit to Selection Button */}
          {selectedLocalities.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMapFitToSelection(true)}
                className="shadow-lg gap-2"
              >
                <Maximize2 size={14} />
                Fit to Selection
              </Button>
            </div>
          )}

          {/* Property Count Overlay */}
          <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-md px-3 py-2">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredProperties.length}</span> properties
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="lg:w-1/2 h-full overflow-y-auto bg-white order-1 lg:order-2">
        <div className="p-4 lg:p-6">
          {/* Selected Localities */}
          {selectedLocalities.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Selected Areas ({selectedLocalities.length}/3)
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedLocalities.map(locality => (
                  <div
                    key={locality}
                    className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg"
                  >
                    <span className="font-medium">{locality}</span>
                    <button
                      onClick={() => toggleLocality(locality)}
                      className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nearby Localities Suggestions */}
          {nearbyLocalities.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Nearby localities you might like
              </div>
              <div className="flex flex-wrap gap-2">
                {nearbyLocalities.map(locality => (
                  <button
                    key={locality.name}
                    onClick={() => toggleLocality(locality.name)}
                    disabled={selectedLocalities.length >= 3}
                    className="text-sm px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {locality.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filters and Actions */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {/* Filters Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal size={16} />
                  Filters
                  {(bedrooms.length > 0 || propertyTypes.length > 0) && (
                    <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                      {bedrooms.length + propertyTypes.length}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filter Properties</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  {/* Price Range */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Price Range
                    </label>
                    <Slider
                      value={priceRange}
                      onValueChange={setPriceRange}
                      min={0}
                      max={50000000}
                      step={1000000}
                      className="mb-2"
                    />
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{formatPrice(priceRange[0])}</span>
                      <span>{formatPrice(priceRange[1])}</span>
                    </div>
                  </div>

                  {/* Bedrooms */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Bedrooms
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map(num => (
                        <button
                          key={num}
                          onClick={() => toggleBedroom(num)}
                          className={`px-4 py-2 rounded-lg border transition-colors ${
                            bedrooms.includes(num)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                          }`}
                        >
                          {num} BHK
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Property Type */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Property Type
                    </label>
                    <div className="space-y-2">
                      {['apartment', 'villa', 'plot'].map(type => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox
                            id={type}
                            checked={propertyTypes.includes(type)}
                            onCheckedChange={() => togglePropertyType(type)}
                          />
                          <label htmlFor={type} className="text-sm capitalize cursor-pointer">
                            {type}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Clear Filters */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setPriceRange([0, 50000000]);
                      setBedrooms([]);
                      setPropertyTypes([]);
                    }}
                  >
                    Clear All Filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* View Trends */}
            {selectedLocalities.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/trends/${selectedLocalities[0]}`)}
                className="gap-2"
              >
                <TrendingUp size={16} />
                View Trends
              </Button>
            )}

            {/* Save Search */}
            {isSignedIn && selectedLocalities.length > 0 && (
              <Button variant="outline" size="sm" className="gap-2 ml-auto">
                <Bookmark size={16} />
                Save Search
              </Button>
            )}
          </div>

          {/* Results */}
          {selectedLocalities.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="text-gray-400" size={32} />
              </div>
              <h3 className="font-semibold text-lg text-gray-900 mb-2">
                Select localities to explore
              </h3>
              <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                Click on localities on the map (up to 3) to see available properties
              </p>
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Quick select:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {cityLocalities.slice(0, 4).map(locality => (
                    <button
                      key={locality.name}
                      onClick={() => toggleLocality(locality.name)}
                      className="text-sm px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      {locality.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <SlidersHorizontal className="text-gray-400" size={32} />
              </div>
              <h3 className="font-semibold text-lg text-gray-900 mb-2">
                No properties match your filters
              </h3>
              <p className="text-gray-600 mb-6">
                Try adjusting your price range or other filters
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setPriceRange([0, 50000000]);
                  setBedrooms([]);
                  setPropertyTypes([]);
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {filteredProperties.length} {filteredProperties.length === 1 ? 'property' : 'properties'} found
                </div>
              </div>
              <div className="grid gap-4">
                {filteredProperties.map(property => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    isAnonymous={!isSignedIn}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
