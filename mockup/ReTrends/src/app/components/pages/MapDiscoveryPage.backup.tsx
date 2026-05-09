import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { MapPin, X, Search, Building2, GraduationCap, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';
import { Checkbox } from '../ui/checkbox';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { PropertyCard } from '../shared/PropertyCard';
import { cities, udupiLocalities, udupiSchools, udupiProperties } from '../../mockData';
import type { School } from '../../types';

type JourneyType = 'area-first' | 'school-first';
type SchoolBoard = 'CBSE' | 'ICSE' | 'State' | 'International';
type SchoolCategory = 'primary' | 'secondary' | 'higher-secondary' | 'international';

const RADIUS_OPTIONS = [1, 2, 3, 5];

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  'primary': 'Primary',
  'secondary': 'Secondary',
  'higher-secondary': 'Higher Secondary',
  'international': 'International',
};

export function MapDiscoveryPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useOutletContext<{ isSignedIn: boolean }>();

  const [selectedCity, setSelectedCity] = useState('Udupi');
  const [journey, setJourney] = useState<JourneyType | null>(null);

  // Area context
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [areaZoomed, setAreaZoomed] = useState(false);

  // School context
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [schoolRadius, setSchoolRadius] = useState(3);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');
  const [browsingSchoolsInArea, setBrowsingSchoolsInArea] = useState(false);

  // School filters
  const [selectedBoards, setSelectedBoards] = useState<SchoolBoard[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<SchoolCategory[]>([]);

  // Property filters
  const [priceRange, setPriceRange] = useState([0, 10000000]);
  const [bedrooms, setBedrooms] = useState<number[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);

  const cityLocalities = selectedCity === 'Udupi' ? udupiLocalities : [];
  const citySchools = selectedCity === 'Udupi' ? udupiSchools : [];

  // Get schools based on context
  const getAvailableSchools = () => {
    let schools = citySchools;

    // Filter by area if applicable
    if (journey === 'area-first' && selectedArea) {
      schools = schools.filter(s => s.locality === selectedArea);
    } else if (journey === 'school-first' && selectedArea && browsingSchoolsInArea) {
      schools = schools.filter(s => s.locality === selectedArea);
    }

    // Apply school filters
    if (selectedBoards.length > 0) {
      schools = schools.filter(s => s.board && selectedBoards.includes(s.board));
    }
    if (selectedCategories.length > 0) {
      schools = schools.filter(s => selectedCategories.includes(s.type));
    }

    return schools;
  };

  const availableSchools = getAvailableSchools();
  const popularSchools = availableSchools.filter(s => s.popular);

  // Search schools (only in global school-first search)
  const filteredSchools = schoolSearchQuery
    ? availableSchools.filter(s =>
        s.name.toLowerCase().includes(schoolSearchQuery.toLowerCase())
      )
    : availableSchools;

  // Filter properties
  const filteredProperties = udupiProperties.filter(p => {
    if (p.city !== selectedCity) return false;
    if (selectedArea && p.locality !== selectedArea) return false;
    if (selectedSchool && p.locality !== selectedSchool.locality) return false;
    if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
    if (bedrooms.length > 0 && !bedrooms.includes(p.bedrooms)) return false;
    if (propertyTypes.length > 0 && !propertyTypes.includes(p.type)) return false;
    return true;
  });

  // Handlers
  const handleStartJourney = (journeyType: JourneyType) => {
    setJourney(journeyType);
  };

  const handleAreaClick = (areaName: string) => {
    setSelectedArea(areaName);
    setAreaZoomed(true);

    if (!journey) {
      setJourney('area-first');
    }

    if (journey === 'school-first' && !selectedSchool) {
      setBrowsingSchoolsInArea(true);
    }
  };

  const handleSchoolClick = (school: School) => {
    setSelectedSchool(school);
    setSchoolSearchQuery('');
    setBrowsingSchoolsInArea(false);

    if (!journey) {
      setJourney('school-first');
    }
  };

  const handleAddSchoolFilter = () => {
    setBrowsingSchoolsInArea(true);
  };

  const handleBackToSchools = () => {
    setSelectedSchool(null);
    setBrowsingSchoolsInArea(true);
  };

  const handleAddAreaFilter = () => {
    setAreaZoomed(false);
    setBrowsingSchoolsInArea(false);
  };

  const handleClearArea = () => {
    setSelectedArea(null);
    setAreaZoomed(false);
    setBrowsingSchoolsInArea(false);
    if (!selectedSchool) setJourney(null);
  };

  const handleClearSchool = () => {
    setSelectedSchool(null);
    setBrowsingSchoolsInArea(false);
    if (!selectedArea) setJourney(null);
  };

  const handleStartOver = () => {
    setJourney(null);
    setSelectedArea(null);
    setSelectedSchool(null);
    setAreaZoomed(false);
    setBrowsingSchoolsInArea(false);
    setSelectedBoards([]);
    setSelectedCategories([]);
    setPriceRange([0, 10000000]);
    setBedrooms([]);
    setPropertyTypes([]);
  };

  const toggleBoard = (board: SchoolBoard) => {
    setSelectedBoards(prev =>
      prev.includes(board) ? prev.filter(b => b !== board) : [...prev, board]
    );
  };

  const toggleCategory = (category: SchoolCategory) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const toggleBedroom = (bedroom: number) => {
    setBedrooms(prev =>
      prev.includes(bedroom) ? prev.filter(b => b !== bedroom) : [...prev, bedroom]
    );
  };

  const togglePropertyType = (type: string) => {
    setPropertyTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const formatPrice = (price: number) => {
    if (price >= 10000000) return `₹${(price / 10000000).toFixed(1)} Cr`;
    return `₹${(price / 100000).toFixed(0)} L`;
  };

  const activeFilterCount = bedrooms.length + propertyTypes.length;
  const hasActiveContext = selectedArea || selectedSchool;
  const hasSchoolFilters = selectedBoards.length > 0 || selectedCategories.length > 0;

  // Determine panel content
  const getPanelContent = () => {
    if (!journey) return 'guided-entry';

    if (journey === 'area-first') {
      if (!selectedArea) return 'area-selection';
      if (browsingSchoolsInArea) return 'schools-in-area';
      if (selectedSchool) return 'area-school-combined';
      return 'area-selected';
    }

    if (journey === 'school-first') {
      if (browsingSchoolsInArea && selectedArea) return 'schools-in-area';
      if (selectedSchool) {
        if (selectedArea) return 'area-school-combined';
        return 'school-selected';
      }
      if (selectedArea && areaZoomed) return 'schools-in-area';
      return 'school-browse';
    }

    return 'guided-entry';
  };

  const panelContent = getPanelContent();

  // School card component
  const SchoolCard = ({ school }: { school: School }) => (
    <button
      onClick={() => handleSchoolClick(school)}
      className="w-full text-left p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl hover:border-purple-400 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <GraduationCap className="text-white" size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 mb-1">
            {school.name}
          </div>
          <div className="text-sm text-gray-600 mb-2">
            {school.address}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {school.board && (
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                {school.board}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {SCHOOL_TYPE_LABELS[school.type] || school.type}
            </Badge>
            {school.nearbyHomesCount && (
              <Badge variant="outline" className="text-xs text-gray-600">
                {school.nearbyHomesCount} nearby homes
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      {/* Map Section */}
      <div className="lg:w-1/2 h-64 lg:h-full bg-gray-100 relative order-2 lg:order-1">
        <div className="w-full h-full bg-gradient-to-br from-blue-50 to-green-50 relative overflow-hidden">
          {/* Map Grid Pattern */}
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-10 grid-rows-10 h-full w-full">
              {Array.from({ length: 100 }).map((_, i) => (
                <div key={i} className="border border-gray-300" />
              ))}
            </div>
          </div>

          {/* Area Location Indicator - Top Left */}
          {selectedArea && areaZoomed && (
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-md px-4 py-2.5 border border-gray-200">
              <div className="text-xs text-gray-500 mb-0.5">
                {selectedCity}
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="text-blue-600" size={16} />
                <span className="font-semibold text-gray-900">{selectedArea}</span>
              </div>
            </div>
          )}

          {/* City Label - Only when no area selected */}
          {!selectedArea && (
            <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md px-3 py-2">
              <div className="flex items-center gap-2">
                <MapPin className="text-blue-600" size={16} />
                <span className="font-semibold text-sm">{selectedCity}</span>
              </div>
            </div>
          )}

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

          {/* Area Markers - shown when not zoomed or in school-first without school selected */}
          {(!areaZoomed || (journey === 'school-first' && !selectedSchool && !browsingSchoolsInArea)) && cityLocalities.slice(0, 6).map((locality, idx) => {
            const isSelected = selectedArea === locality.name;
            const showSchoolCount = journey === 'school-first' && !selectedSchool;
            const positions = [
              { top: '20%', left: '25%' },
              { top: '30%', left: '55%' },
              { top: '45%', left: '35%' },
              { top: '55%', left: '65%' },
              { top: '70%', left: '30%' },
              { top: '60%', left: '50%' },
            ];
            const pos = positions[idx];

            return (
              <div
                key={locality.name}
                className="absolute cursor-pointer transition-all z-20"
                style={pos}
                onClick={() => handleAreaClick(locality.name)}
              >
                <div
                  className={`px-3 py-2 rounded-lg shadow-lg transition-all transform hover:scale-105 ${
                    isSelected
                      ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                      : 'bg-white text-gray-900 hover:bg-blue-50'
                  }`}
                >
                  <div className="font-semibold text-sm whitespace-nowrap flex items-center gap-1.5">
                    {showSchoolCount && <GraduationCap size={14} className={isSelected ? 'text-blue-100' : 'text-purple-600'} />}
                    {locality.name}
                  </div>
                  <div className={`text-xs ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                    {showSchoolCount ? `${locality.schoolCount} schools` : `${locality.propertyCount} properties`}
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

          {/* School Pins - shown when browsing schools in selected area */}
          {browsingSchoolsInArea && selectedArea && !selectedSchool && (
            <>
              {citySchools.filter(s => s.locality === selectedArea).slice(0, 5).map((school, idx) => {
                const positions = [
                  { top: '25%', left: '35%' },
                  { top: '35%', left: '60%' },
                  { top: '50%', left: '45%' },
                  { top: '65%', left: '30%' },
                  { top: '55%', left: '65%' },
                ];
                const pos = positions[idx];

                return (
                  <div
                    key={school.id}
                    className="absolute cursor-pointer transition-all z-10"
                    style={pos}
                    onClick={() => handleSchoolClick(school)}
                  >
                    <div className="bg-purple-600 text-white px-2.5 py-1.5 rounded-lg shadow-lg hover:bg-purple-700 hover:scale-105 transition-all">
                      <div className="flex items-center gap-1.5">
                        <GraduationCap size={14} />
                        <span className="text-xs font-medium whitespace-nowrap">
                          {school.name.split(' ').slice(0, 2).join(' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Selected School Marker with Radius */}
          {selectedSchool && (
            <div
              className="absolute z-30"
              style={{ top: '40%', left: '45%' }}
            >
              {/* Radius Circle */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-purple-400 bg-purple-100 opacity-30"
                style={{
                  width: `${schoolRadius * 60}px`,
                  height: `${schoolRadius * 60}px`,
                }}
              />

              {/* School Pin */}
              <div className="relative z-10 bg-purple-600 text-white px-3 py-2 rounded-lg shadow-lg ring-4 ring-purple-200">
                <div className="flex items-center gap-1.5">
                  <GraduationCap size={14} />
                  <div className="font-semibold text-sm whitespace-nowrap">
                    {selectedSchool.name}
                  </div>
                </div>
                <div className="text-xs text-purple-100 mt-0.5">
                  {schoolRadius} km radius
                </div>
              </div>

              {/* Property markers around selected school */}
              {[
                { top: '-40px', left: '60px' },
                { top: '30px', left: '-50px' },
                { top: '50px', left: '80px' },
                { top: '-20px', left: '-60px' },
              ].map((pos, idx) => (
                <div
                  key={idx}
                  className="absolute w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-md"
                  style={pos}
                />
              ))}
            </div>
          )}

          {/* Property Count Overlay */}
          <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-md px-3 py-2">
            <div className="text-sm text-gray-600">
              {selectedSchool || (selectedArea && journey === 'area-first' && !browsingSchoolsInArea) ? (
                <>
                  <span className="font-semibold text-gray-900">{filteredProperties.length}</span> properties
                </>
              ) : browsingSchoolsInArea && selectedArea ? (
                <>
                  <span className="font-semibold text-gray-900">{availableSchools.length}</span> schools
                </>
              ) : (
                <span className="text-gray-500">Select to explore</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results / Context Panel */}
      <div className="lg:w-1/2 h-full overflow-y-auto bg-white order-1 lg:order-2 flex flex-col">
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <div className="p-4 lg:p-6 pb-4">
            {/* Journey Indicator & Start Over */}
            {journey && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {journey === 'area-first' ? (
                    <>
                      <Building2 size={14} />
                      <span>Exploring by area</span>
                    </>
                  ) : (
                    <>
                      <GraduationCap size={14} />
                      <span>Search by school area</span>
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartOver}
                  className="text-gray-600"
                >
                  Start over
                </Button>
              </div>
            )}

            {/* Active Chips */}
            {hasActiveContext && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedArea && (
                  <Badge variant="secondary" className="gap-2 pl-3 pr-2 py-1.5">
                    <Building2 size={12} />
                    <span>Area: {selectedArea}</span>
                    <button
                      onClick={handleClearArea}
                      className="hover:bg-gray-300 rounded-full p-0.5 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </Badge>
                )}
                {selectedSchool && (
                  <Badge variant="secondary" className="gap-2 pl-3 pr-2 py-1.5 bg-purple-100 text-purple-900 hover:bg-purple-100">
                    <GraduationCap size={12} />
                    <span>Near {selectedSchool.name} · {schoolRadius} km</span>
                    <button
                      onClick={handleClearSchool}
                      className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </Badge>
                )}
                {bedrooms.map(bed => (
                  <Badge key={bed} variant="outline" className="gap-1.5 pl-2 pr-1.5 py-1">
                    <span>{bed} BHK</span>
                    <button
                      onClick={() => toggleBedroom(bed)}
                      className="hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
                {priceRange[0] > 0 || priceRange[1] < 10000000 ? (
                  <Badge variant="outline" className="gap-1.5 pl-2 pr-1.5 py-1">
                    <span>{formatPrice(priceRange[0])}–{formatPrice(priceRange[1])}</span>
                    <button
                      onClick={() => setPriceRange([0, 10000000])}
                      className="hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </Badge>
                ) : null}
              </div>
            )}

            {/* Action Buttons */}
            {(selectedSchool || (selectedArea && !browsingSchoolsInArea && journey === 'area-first')) && (
              <div className="flex items-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <SlidersHorizontal size={16} />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Filter Properties</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-6">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-3 block">
                          Price Range
                        </label>
                        <Slider
                          value={priceRange}
                          onValueChange={setPriceRange}
                          min={0}
                          max={10000000}
                          step={100000}
                          className="mb-2"
                        />
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>{formatPrice(priceRange[0])}</span>
                          <span>{formatPrice(priceRange[1])}</span>
                        </div>
                      </div>

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
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>

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

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setPriceRange([0, 10000000]);
                          setBedrooms([]);
                          setPropertyTypes([]);
                        }}
                      >
                        Clear All Filters
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Back to Schools button when school is selected in school-first */}
                {selectedSchool && journey === 'school-first' && selectedArea && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToSchools}
                    className="gap-2"
                  >
                    <ArrowLeft size={14} />
                    Back to schools
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 pt-0">
            {/* GUIDED ENTRY */}
            {panelContent === 'guided-entry' && (
              <div className="py-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  Find properties your way
                </h2>
                <p className="text-gray-600 mb-8">
                  Start with an area or a school. You can combine both later.
                </p>

                <div className="grid gap-4">
                  <button
                    onClick={() => handleStartJourney('area-first')}
                    className="text-left p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border-2 border-blue-200 hover:border-blue-400 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="text-white" size={24} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          Explore properties by area
                        </h3>
                        <p className="text-sm text-gray-600">
                          Browse homes in Manipal, Kunjibettu, Kundapur, and more
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleStartJourney('school-first')}
                    className="text-left p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border-2 border-purple-200 hover:border-purple-400 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="text-white" size={24} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          Search by school area
                        </h3>
                        <p className="text-sm text-gray-600">
                          Choose an area to browse schools, then find nearby properties
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* AREA SELECTION */}
            {panelContent === 'area-selection' && (
              <div className="py-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Choose an area
                </h2>
                <p className="text-gray-600 mb-6">
                  Click on an area marker on the map or select from popular areas below
                </p>

                <div className="space-y-3">
                  {cityLocalities.map(locality => (
                    <button
                      key={locality.name}
                      onClick={() => handleAreaClick(locality.name)}
                      className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {locality.name}
                          </div>
                          <div className="text-sm text-gray-600">
                            {locality.propertyCount} properties
                            {locality.avgPrice && (
                              <span className="ml-2">· Avg {formatPrice(locality.avgPrice)}</span>
                            )}
                          </div>
                        </div>
                        {locality.trending && (
                          <Badge variant="secondary" className="bg-green-100 text-green-700">
                            Trending
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AREA SELECTED */}
            {panelContent === 'area-selected' && (
              <div className="py-6">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    You're viewing {selectedArea}
                  </h2>
                  <p className="text-gray-600 mb-4">
                    {filteredProperties.length} properties found
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddSchoolFilter}
                    className="gap-2"
                  >
                    <GraduationCap size={14} />
                    Add a school in this area
                  </Button>
                </div>

                {filteredProperties.length > 0 ? (
                  <div className="space-y-4">
                    {filteredProperties.map(property => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        isAnonymous={!isSignedIn}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-600 mb-4">
                      No properties match your filters
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPriceRange([0, 10000000]);
                        setBedrooms([]);
                        setPropertyTypes([]);
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* SCHOOLS IN AREA */}
            {panelContent === 'schools-in-area' && (
              <div className="py-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Schools in {selectedArea}
                </h2>
                <p className="text-gray-600 mb-6">
                  Choose a school to view nearby homes
                </p>

                {/* School Type Filters */}
                {availableSchools.length > 3 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Filter schools
                    </h3>

                    <div className="space-y-3">
                      {/* Board filters */}
                      <div>
                        <div className="text-xs text-gray-500 mb-2">Board</div>
                        <div className="flex flex-wrap gap-2">
                          {(['CBSE', 'ICSE', 'State', 'International'] as SchoolBoard[]).map(board => (
                            <button
                              key={board}
                              onClick={() => toggleBoard(board)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                selectedBoards.includes(board)
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                              }`}
                            >
                              {board}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Category filters */}
                      <div>
                        <div className="text-xs text-gray-500 mb-2">Category</div>
                        <div className="flex flex-wrap gap-2">
                          {(['primary', 'secondary', 'higher-secondary'] as SchoolCategory[]).map(category => (
                            <button
                              key={category}
                              onClick={() => toggleCategory(category)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                selectedCategories.includes(category)
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                              }`}
                            >
                              {SCHOOL_TYPE_LABELS[category]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Clear filters */}
                      {hasSchoolFilters && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedBoards([]);
                            setSelectedCategories([]);
                          }}
                          className="text-xs"
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Schools List */}
                {availableSchools.length > 0 ? (
                  <div className="space-y-3">
                    {availableSchools.map(school => (
                      <SchoolCard key={school.id} school={school} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <GraduationCap className="mx-auto text-gray-400 mb-3" size={40} />
                    <h3 className="font-semibold text-gray-900 mb-2">
                      No schools found in this area
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {hasSchoolFilters ? 'Try adjusting your filters' : 'Try another area'}
                    </p>
                    <div className="flex flex-col gap-2">
                      {hasSchoolFilters && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedBoards([]);
                            setSelectedCategories([]);
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={handleClearArea}
                      >
                        Pick a different area
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SCHOOL BROWSE (school-first initial) */}
            {panelContent === 'school-browse' && (
              <div className="py-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Search by school area
                </h2>
                <p className="text-gray-600 mb-6">
                  Choose an area to browse schools
                </p>

                {/* Global School Search - Secondary */}
                <div className="mb-8">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      placeholder="Or search school name..."
                      value={schoolSearchQuery}
                      onChange={(e) => setSchoolSearchQuery(e.target.value)}
                      className="pl-10 bg-gray-50"
                    />
                  </div>
                  {schoolSearchQuery && (
                    <div className="mt-3 space-y-3">
                      {filteredSchools.length > 0 ? (
                        filteredSchools.map(school => (
                          <SchoolCard key={school.id} school={school} />
                        ))
                      ) : (
                        <p className="text-center text-gray-500 py-4">No schools found</p>
                      )}
                    </div>
                  )}
                </div>

                {!schoolSearchQuery && (
                  <>
                    {/* Popular Schools */}
                    {popularSchools.length > 0 && (
                      <div className="mb-8">
                        <h3 className="text-sm font-medium text-gray-700 mb-3">
                          Popular schools
                        </h3>
                        <div className="space-y-3">
                          {popularSchools.map(school => (
                            <SchoolCard key={school.id} school={school} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Browse by Area */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">
                        Browse schools by area
                      </h3>
                      <div className="grid gap-3">
                        {cityLocalities.map(locality => (
                          <button
                            key={locality.name}
                            onClick={() => handleAreaClick(locality.name)}
                            className="text-left p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:shadow-md transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-gray-900">
                                  {locality.name}
                                </div>
                                <div className="text-sm text-purple-700 flex items-center gap-1.5 mt-1">
                                  <GraduationCap size={14} />
                                  {locality.schoolCount} schools
                                </div>
                              </div>
                              {locality.trending && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                  Popular
                                </Badge>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SCHOOL SELECTED */}
            {panelContent === 'school-selected' && (
              <div className="py-6">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Homes near {selectedSchool?.name}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    {selectedSchool?.address}
                  </p>

                  {/* Radius Selector */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Search radius
                    </label>
                    <div className="flex gap-2">
                      {RADIUS_OPTIONS.map(radius => (
                        <button
                          key={radius}
                          onClick={() => setSchoolRadius(radius)}
                          className={`px-4 py-2 rounded-lg border transition-colors ${
                            schoolRadius === radius
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                          }`}
                        >
                          {radius} km
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-gray-600">
                      {filteredProperties.length} properties found
                    </div>
                    {!selectedArea && journey === 'school-first' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddAreaFilter}
                        className="gap-2"
                      >
                        <Building2 size={14} />
                        Add area filter
                      </Button>
                    )}
                  </div>
                </div>

                {filteredProperties.length > 0 ? (
                  <div className="space-y-4">
                    {filteredProperties.map(property => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        isAnonymous={!isSignedIn}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-600 mb-2">
                      No homes found near this school
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Try adjusting your search
                    </p>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSchoolRadius(Math.min(schoolRadius + 1, 5))}
                        disabled={schoolRadius >= 5}
                      >
                        Increase radius to {Math.min(schoolRadius + 1, 5)} km
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPriceRange([0, 10000000]);
                          setBedrooms([]);
                          setPropertyTypes([]);
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AREA + SCHOOL COMBINED */}
            {panelContent === 'area-school-combined' && (
              <div className="py-6">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Homes in {selectedArea} near {selectedSchool?.name}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Properties matching both your area and school criteria
                  </p>

                  {/* Radius Selector */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Search radius from school
                    </label>
                    <div className="flex gap-2">
                      {RADIUS_OPTIONS.map(radius => (
                        <button
                          key={radius}
                          onClick={() => setSchoolRadius(radius)}
                          className={`px-4 py-2 rounded-lg border transition-colors ${
                            schoolRadius === radius
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                          }`}
                        >
                          {radius} km
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 mb-4">
                    {filteredProperties.length} properties found
                  </div>
                </div>

                {filteredProperties.length > 0 ? (
                  <div className="space-y-4">
                    {filteredProperties.map(property => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        isAnonymous={!isSignedIn}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-600 mb-2">
                      No properties found for this combination
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Try adjusting your filters or search criteria
                    </p>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSchoolRadius(Math.min(schoolRadius + 1, 5))}
                        disabled={schoolRadius >= 5}
                      >
                        Increase radius to {Math.min(schoolRadius + 1, 5)} km
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleClearArea}
                      >
                        Clear area filter
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleClearSchool}
                      >
                        Clear school filter
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
