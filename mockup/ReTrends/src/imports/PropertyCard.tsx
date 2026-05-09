import { Link } from 'react-router';
import { Property } from '../../types';
import { TrustBadge } from './TrustBadge';
import { Bed, Bath, Maximize, MapPin, Calendar } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';

interface PropertyCardProps {
  property: Property;
  isAnonymous?: boolean;
}

export function PropertyCard({ property, isAnonymous = false }: PropertyCardProps) {
  const formatPrice = (price: number) => {
    const crore = price / 10000000;
    const lakh = price / 100000;
    if (crore >= 1) {
      return `₹${crore.toFixed(2)} Cr`;
    }
    return `₹${lakh.toFixed(0)} L`;
  };

  return (
    <Link to={`/listing/${property.id}`} className="block group">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
        {/* Image */}
        <div className="relative h-48 bg-gray-100 overflow-hidden">
          <ImageWithFallback
            src={`https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&h=400&fit=crop`}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-3 right-3">
            <TrustBadge tier={property.trustTier} size="sm" />
          </div>
          {property.postedDays <= 7 && (
            <div className="absolute top-3 left-3 bg-orange-500 text-white text-xs px-2 py-1 rounded-md font-medium">
              New
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
              {property.title}
            </h3>
          </div>

          <div className="flex items-center gap-1 text-sm text-gray-600 mb-3">
            <MapPin size={14} className="text-gray-400" />
            <span>{property.locality}, {property.city}</span>
          </div>

          <div className="flex items-center gap-4 mb-3 text-sm text-gray-700">
            <div className="flex items-center gap-1.5">
              <Bed size={16} className="text-gray-400" />
              <span>{property.bedrooms} BHK</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Bath size={16} className="text-gray-400" />
              <span>{property.bathrooms}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Maximize size={16} className="text-gray-400" />
              <span>{property.area} sq.ft</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div>
              <div className="text-xl font-bold text-gray-900">
                {isAnonymous ? formatPrice(property.price).replace(/\d/g, '•') : formatPrice(property.price)}
              </div>
              {isAnonymous && (
                <div className="text-xs text-gray-500 mt-0.5">Sign in to view price</div>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar size={12} />
              <span>{property.postedDays}d ago</span>
            </div>
          </div>

          {property.highlights && property.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {property.highlights.slice(0, isAnonymous ? 2 : 3).map((highlight, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded border border-gray-200"
                >
                  {highlight}
                </span>
              ))}
              {isAnonymous && property.highlights.length > 2 && (
                <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 font-medium">
                  +{property.highlights.length - 2} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
