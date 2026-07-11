import * as React from "react";

export interface Property {
  title?: string;
  locality?: string;
  city?: string;
  /** Image URL for the listing photo. */
  image?: string;
  /** Trust tier shown as an overlay badge. */
  trustTier?: "verified" | "trusted" | "listed";
  bedrooms?: number;
  bathrooms?: number;
  /** Carpet/built-up area in sq.ft. */
  area?: number;
  /** Price in rupees; auto-formatted to Cr / L. */
  price?: number;
  /** Days since posting; ≤7 auto-shows a "New" flag. */
  postedDays?: number;
  /** Feature chips (e.g. "Park-facing", "Modular kitchen"). */
  highlights?: string[];
  isNew?: boolean;
}

/**
 * Property listing card — the core unit of every ReTrends results grid.
 * Prices auto-format to Indian Cr/Lakh and always render in mono.
 *
 * @startingPoint section="Listings" subtitle="Listing card with trust overlay, specs & price" viewport="340x420"
 */
export interface PropertyCardProps extends React.HTMLAttributes<HTMLDivElement> {
  property: Property;
  onClick?: () => void;
}

export function PropertyCard(props: PropertyCardProps): JSX.Element;
