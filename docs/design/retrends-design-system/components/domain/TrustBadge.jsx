import React from "react";
import { Icon } from "../Icon.jsx";

const TIERS = {
  verified: { icon: "shield-check", label: "Verified", fg: "var(--trust-verified-fg)", bg: "var(--trust-verified-bg)" },
  trusted:  { icon: "shield",       label: "Trusted",  fg: "var(--trust-trusted-fg)",  bg: "var(--trust-trusted-bg)" },
  listed:   { icon: "file-check",   label: "Listed",   fg: "var(--trust-listed-fg)",   bg: "var(--trust-listed-bg)" },
};

const SIZE = { sm: { icon: 13, font: "11px", pad: "3px 7px" }, md: { icon: 15, font: "12px", pad: "4px 9px" } };

/** ReTrends trust signal — the brand's defining UI element. */
export function TrustBadge({ tier = "verified", size = "md", showLabel = true, style, ...rest }) {
  const t = TIERS[tier] || TIERS.verified;
  const s = SIZE[size] || SIZE.md;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: s.pad,
        background: t.bg,
        color: t.fg,
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-sans)",
        fontSize: s.font,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      <Icon name={t.icon} size={s.icon} strokeWidth={2.4} />
      {showLabel && t.label}
    </span>
  );
}
