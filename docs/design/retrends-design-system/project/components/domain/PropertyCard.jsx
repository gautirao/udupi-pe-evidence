import React from "react";
import { Icon } from "../Icon.jsx";
import { TrustBadge } from "./TrustBadge.jsx";

function formatINR(price) {
  if (price == null) return "—";
  const cr = price / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`;
  return `₹${(price / 100000).toFixed(0)} L`;
}

/** Property listing card — the core unit of every ReTrends results grid. */
export function PropertyCard({ property = {}, onClick, style, ...rest }) {
  const {
    title = "Untitled property",
    locality = "",
    city = "",
    image,
    trustTier = "listed",
    bedrooms,
    bathrooms,
    area,
    price,
    postedDays,
    highlights = [],
    isNew,
  } = property;
  const [hover, setHover] = React.useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: hover ? "var(--shadow-lg)" : "var(--shadow-sm)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
      {...rest}
    >
      {/* Image */}
      <div style={{ position: "relative", height: "176px", background: "var(--surface-muted)", overflow: "hidden" }}>
        {image && (
          <img
            src={image}
            alt={title}
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              transform: hover ? "scale(1.05)" : "scale(1)",
              transition: "transform var(--dur-slow) var(--ease-standard)",
            }}
          />
        )}
        <div style={{ position: "absolute", top: "12px", right: "12px" }}>
          <TrustBadge tier={trustTier} size="sm" />
        </div>
        {(isNew || (postedDays != null && postedDays <= 7)) && (
          <div style={{
            position: "absolute", top: "12px", left: "12px",
            background: "var(--accent)", color: "#fff",
            fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "var(--radius-sm)",
          }}>New</div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "16px" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
          <Icon name="map-pin" size={14} color="var(--grey-400)" />
          <span>{[locality, city].filter(Boolean).join(", ")}</span>
        </div>

        <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--text-body)", marginBottom: "12px" }}>
          {bedrooms != null && <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name="bed" size={15} color="var(--grey-400)" />{bedrooms} BHK</span>}
          {bathrooms != null && <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name="bath" size={15} color="var(--grey-400)" />{bathrooms}</span>}
          {area != null && <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name="maximize" size={15} color="var(--grey-400)" />{area} sq.ft</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 600, color: "var(--text-strong)" }}>
            {formatINR(price)}
          </span>
          {postedDays != null && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
              <Icon name="calendar" size={12} />{postedDays}d ago
            </span>
          )}
        </div>

        {highlights.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
            {highlights.slice(0, 3).map((h, i) => (
              <span key={i} style={{
                fontSize: "12px", padding: "3px 8px",
                background: "var(--grey-50)", color: "var(--text-body)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-xs)",
              }}>{h}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
