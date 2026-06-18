import React from "react";
import { Icon } from "../Icon.jsx";

/** Compact KPI tile for trends / area-overview dashboards. Value set in mono. */
export function StatTile({ label, value, unit, delta, deltaDir, hint, style, ...rest }) {
  const dir = deltaDir || (delta != null ? (String(delta).trim().startsWith("-") ? "down" : "up") : null);
  const deltaColor = dir === "down" ? "var(--negative)" : "var(--positive)";

  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 18px",
        boxShadow: "var(--shadow-xs)",
        fontFamily: "var(--font-sans)",
        minWidth: "150px",
        ...style,
      }}
      {...rest}
    >
      <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1 }}>
          {value}{unit && <span style={{ fontSize: "14px", color: "var(--text-muted)", marginLeft: "2px" }}>{unit}</span>}
        </span>
        {delta != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "13px", fontWeight: 600, color: deltaColor }}>
            <Icon name={dir === "down" ? "trending-down" : "trending-up"} size={14} />
            {delta}
          </span>
        )}
      </div>
      {hint && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>{hint}</div>}
    </div>
  );
}
