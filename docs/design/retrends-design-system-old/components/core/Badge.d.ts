import * as React from "react";

/** Small status / category label. Tones map to the ReTrends semantic palette. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone. Default "neutral". */
  tone?: "neutral" | "navy" | "accent" | "verified" | "trusted" | "positive" | "caution" | "negative";
  /** Solid fill instead of tint (only neutral/navy/accent). */
  solid?: boolean;
  /** Fully rounded pill instead of small radius. */
  pill?: boolean;
  children?: React.ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;
