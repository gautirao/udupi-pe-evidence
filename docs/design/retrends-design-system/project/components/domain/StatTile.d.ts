import * as React from "react";

/** KPI tile for trends and area-overview dashboards. The big number is mono. */
export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase caption above the value. */
  label: string;
  /** Main metric (e.g. "₹1.42", "428"). */
  value: React.ReactNode;
  /** Optional unit suffix (e.g. "Cr", "/sq.ft"). */
  unit?: string;
  /** Trend delta text (e.g. "12.4%"). */
  delta?: string;
  /** Force trend direction; otherwise inferred from a leading "-". */
  deltaDir?: "up" | "down";
  /** Small caption below. */
  hint?: string;
}

export function StatTile(props: StatTileProps): JSX.Element;
