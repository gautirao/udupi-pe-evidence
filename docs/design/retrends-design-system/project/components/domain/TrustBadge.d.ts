import * as React from "react";

/**
 * The ReTrends trust signal — appears on every listing. Three tiers communicate
 * verification depth. This is the single most brand-defining component.
 *
 * @startingPoint section="Trust" subtitle="Verified / Trusted / Listed trust tiers" viewport="700x120"
 */
export interface TrustBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Verification tier. Default "verified". */
  tier?: "verified" | "trusted" | "listed";
  /** Size. Default "md". Use "sm" for image overlays. */
  size?: "sm" | "md";
  /** Show the text label next to the icon. Default true. */
  showLabel?: boolean;
}

export function TrustBadge(props: TrustBadgeProps): JSX.Element;
