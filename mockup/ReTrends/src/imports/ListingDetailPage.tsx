import { useState } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router';
import { MapPin, Bed, Bath, Maximize, Calendar, Phone, Mail, Eye, TrendingUp, Share2, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { TrustBadge, TrustBadgeDetail } from '../shared/TrustBadge';
import { PropertyCard } from '../shared/PropertyCard';
import { SignInDialog } from '../shared/SignInDialog';
import { mockProperties } from '../../mockData';
import { ImageWithFallback } from '../figma/ImageWithFallback';

export function ListingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSignedIn, setShowSignIn } = useOutletContext<{
    isSignedIn: boolean;
    setShowSignIn: (show: boolean) => void;
  }>();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showRequestViewing, setShowRequestViewing] = useState(false);
  const [viewingRequested, setViewingRequested] = useState(false);

  const property = mockProperties.find(p => p.id === id);

  if (!property) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Property not found</h2>
          <Button onClick={() => navigate('/discover')}>Back to Discovery</Button>
        </div>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    const crore = price / 10000000;
    return `₹${crore.toFixed(2)} Crore`;
  };

  const relatedProperties = mockProperties
    .filter(p => p.locality === property.locality && p.id !== property.id)
    .slice(0, 2);

  const handleRequestViewing = () => {
    if (!isSignedIn) {
      setShowSignIn(true);
      return;
    }
    setShowRequestViewing(true);
  };

  const handleConfirmViewing = () => {
    setViewingRequested(true);
    setTimeout(() => {
      setShowRequestViewing(false);
    }, 2000);
  };

  const handleContactBroker = () => {
    if (!isSignedIn) {
      setShowSignIn(true);
    }
  };

  // Mock images
  const images = [
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&h=800&fit=crop',
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <button onClick={() => navigate('/')} className="hover:text-blue-600">
            Home
          </button>
          <span>/</span>
          <button onClick={() => navigate('/discover')} className="hover:text-blue-600">
            Discover
          </button>
          <span>/</span>
          <span>{property.locality}</span>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Gallery */}
            <div className="bg-white rounded-lg overflow-hidden shadow-sm">
              <div className="relative h-96 bg-gray-100">
                <ImageWithFallback
                  src={images[currentImageIndex]}
                  alt={property.title}
                  className="w-full h-full object-cover"
                />

                {/* Navigation */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))}
                      disabled={currentImageIndex === 0}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => setCurrentImageIndex(Math.min(images.length - 1, currentImageIndex + 1))}
                      disabled={currentImageIndex === images.length - 1}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}

                {/* Image Counter */}
                <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm">
                  {currentImageIndex + 1} / {images.length}
                </div>

                {/* Trust Badge */}
                <div className="absolute top-4 left-4">
                  <TrustBadge tier={property.trustTier} size="md" />
                </div>

                {/* Actions */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors">
                    <Share2 size={18} />
                  </button>
                  <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors">
                    <Heart size={18} />
                  </button>
                </div>

                {/* Anonymous Overlay */}
                {!isSignedIn && currentImageIndex > 0 && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <div className="text-center text-white max-w-sm px-6">
                      <Eye className="mx-auto mb-4" size={48} />
                      <h3 className="text-xl font-semibold mb-2">Sign in to view all photos</h3>
                      <p className="text-gray-200 text-sm mb-4">
                        Get full access to property photos, broker details, and more
                      </p>
                      <Button onClick={() => setShowSignIn(true)} variant="secondary" size="lg">
                        Sign In to Continue
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Thumbnail Strip */}
              {isSignedIn && images.length > 1 && (
                <div className="p-4 flex gap-2 overflow-x-auto">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        currentImageIndex === idx ? 'border-blue-600 scale-105' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <ImageWithFallback
                        src={img}
                        alt={`View ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Property Details */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">{property.title}</h1>
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={18} className="text-gray-400" />
                    <span>{property.locality}, {property.city}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900">
                    {isSignedIn ? formatPrice(property.price) : '₹••.•• Cr'}
                  </div>
                  {!isSignedIn && (
                    <button
                      onClick={() => setShowSignIn(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-1"
                    >
                      Sign in to view price
                    </button>
                  )}
                </div>
              </div>

              {/* Key Stats */}
              <div className="grid grid-cols-4 gap-4 py-4 border-t border-b border-gray-200">
                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Bed size={18} className="text-gray-400" />
                    <span className="text-sm">Bedrooms</span>
                  </div>
                  <div className="font-semibold text-lg">{property.bedrooms} BHK</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Bath size={18} className="text-gray-400" />
                    <span className="text-sm">Bathrooms</span>
                  </div>
                  <div className="font-semibold text-lg">{property.bathrooms}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Maximize size={18} className="text-gray-400" />
                    <span className="text-sm">Area</span>
                  </div>
                  <div className="font-semibold text-lg">{property.area} sq.ft</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Calendar size={18} className="text-gray-400" />
                    <span className="text-sm">Posted</span>
                  </div>
                  <div className="font-semibold text-lg">{property.postedDays}d ago</div>
                </div>
              </div>

              {/* Description */}
              {property.description && (
                <div className="mt-6">
                  <h2 className="font-semibold text-lg text-gray-900 mb-3">About this property</h2>
                  <p className="text-gray-700 leading-relaxed">
                    {isSignedIn ? property.description : `${property.description.substring(0, 120)}...`}
                  </p>
                  {!isSignedIn && (
                    <button
                      onClick={() => setShowSignIn(true)}
                      className="text-blue-600 hover:text-blue-700 font-medium text-sm mt-2"
                    >
                      Sign in to read more
                    </button>
                  )}
                </div>
              )}

              {/* Highlights */}
              {property.highlights && property.highlights.length > 0 && (
                <div className="mt-6">
                  <h2 className="font-semibold text-lg text-gray-900 mb-3">Key Highlights</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {property.highlights.slice(0, isSignedIn ? undefined : 3).map((highlight, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-gray-700">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                        <span className="text-sm">{highlight}</span>
                      </div>
                    ))}
                    {!isSignedIn && property.highlights.length > 3 && (
                      <button
                        onClick={() => setShowSignIn(true)}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm text-left"
                      >
                        +{property.highlights.length - 3} more highlights
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Amenities */}
              {isSignedIn && property.amenities && property.amenities.length > 0 && (
                <div className="mt-6">
                  <h2 className="font-semibold text-lg text-gray-900 mb-3">Amenities</h2>
                  <div className="flex flex-wrap gap-2">
                    {property.amenities.map((amenity, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Trust & Verification */}
            {isSignedIn && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">Trust & Verification</h2>
                <TrustBadgeDetail tier={property.trustTier} />
              </div>
            )}

            {/* Broker Details */}
            {isSignedIn && property.broker && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">Listed By</h2>
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xl font-semibold">
                    {property.broker.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{property.broker.name}</h3>
                      {property.broker.verified && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                          Verified
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>{property.broker.propertiesListed} properties listed</div>
                      <div>{property.broker.yearsActive} years in business</div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button onClick={handleContactBroker} size="sm" className="gap-2">
                        <Phone size={14} />
                        Call
                      </Button>
                      <Button onClick={handleContactBroker} variant="outline" size="sm" className="gap-2">
                        <Mail size={14} />
                        Email
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Related Properties */}
            {relatedProperties.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">
                  More in {property.locality}
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {relatedProperties.map(relatedProp => (
                    <PropertyCard
                      key={relatedProp.id}
                      property={relatedProp}
                      isAnonymous={!isSignedIn}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Action Card */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Interested in this property?</h3>

                {viewingRequested ? (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1">Request Sent!</h4>
                    <p className="text-sm text-gray-600">
                      The broker will contact you within 24 hours
                    </p>
                  </div>
                ) : (
                  <>
                    <Button
                      onClick={handleRequestViewing}
                      size="lg"
                      className="w-full mb-3"
                    >
                      Request Viewing
                    </Button>
                    <Button
                      onClick={handleContactBroker}
                      variant="outline"
                      size="lg"
                      className="w-full"
                    >
                      Contact Broker
                    </Button>
                  </>
                )}

                {!isSignedIn && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-700">
                      Sign in to directly contact the broker and schedule viewings
                    </p>
                  </div>
                )}
              </div>

              {/* Locality Insights */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="text-purple-600" size={20} />
                  <h3 className="font-semibold text-gray-900">Locality Insights</h3>
                </div>
                <p className="text-sm text-gray-700 mb-4">
                  View market trends and insights for {property.locality}
                </p>
                <Button
                  onClick={() => navigate(`/trends/${property.locality}`)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  View Trends
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Request Viewing Dialog */}
      <SignInDialog
        open={showRequestViewing}
        onOpenChange={setShowRequestViewing}
        reason="Almost there! Just confirm your viewing request and we'll notify the broker."
      />
      {showRequestViewing && isSignedIn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Request Property Viewing</h3>
            <p className="text-gray-600 mb-6">
              Confirm your viewing request for <strong>{property.title}</strong>. The broker will contact you within 24 hours to schedule.
            </p>
            <div className="flex gap-3">
              <Button onClick={handleConfirmViewing} className="flex-1">
                Confirm Request
              </Button>
              <Button onClick={() => setShowRequestViewing(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
