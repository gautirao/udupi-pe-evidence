import React from "react";

const TONES = {
  neutral:  { bg: "var(--grey-100)", fg: "var(--grey-700)" },
  navy:     { bg: "var(--navy-100)", fg: "var(--navy-800)" },
  accent:   { bg: "var(--accent-tint)", fg: "var(--accent-hover)" },
  verified: { bg: "var(--trust-verified-bg)", fg: "var(--trust-verified-fg)" },
  trusted:  { bg: "var(--trust-trusted-bg)", fg: "var(--trust-trusted-fg)" },
  positive: { bg: "var(--positive-bg)", fg: "var(--positive)" },
  caution:  { bg: "var(--caution-bg)", fg: "var(--caution)" },
  negative: { bg: "var(--negative-bg)", fg: "var(--negative)" },
};

const SOLID = {
  neutral: { bg: "var(--grey-700)", fg: "#fff" },
  navy:    { bg: "var(--navy-800)", fg: "#fff" },
  accent:  { bg: "var(--accent)", fg: "#fff" },
};

export function Badge({ tone = "neutral", solid = false, pill = false, children, style, ...rest }) {
  const t = (solid ? SOLID[tone] : TONES[tone]) || TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 9px",
        fontFamily: "var(--font-sans)",
        fontSize: "12px",
        fontWeight: 600,
        lineHeight: 1.3,
        color: t.fg,
        background: t.bg,
        borderRadius: pill ? "var(--radius-full)" : "var(--radius-sm)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
