import * as React from "react";

export type IconName =
  | "map-pin" | "search" | "trending-up" | "trending-down"
  | "shield-check" | "shield" | "file-check"
  | "bed" | "bath" | "maximize" | "calendar"
  | "heart" | "star" | "arrow-right" | "chevron-down"
  | "check" | "x" | "sliders-horizontal" | "building"
  | "plus" | "camera" | "pencil" | "eye" | "message-circle"
  | "alert-triangle" | "arrow-up-right" | "layers" | "users"
  | "chevron-right" | "route";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  /** Lucide icon name from the ReTrends in-system subset. */
  name: IconName;
  /** Pixel size (width = height). Default 20. */
  size?: number;
  /** Stroke width. Default 2. */
  strokeWidth?: number;
  /** Stroke color. Default currentColor. */
  color?: string;
}

/** ReTrends Lucide icon. Inherits color via currentColor by default. */
export function Icon(props: IconProps): JSX.Element;
