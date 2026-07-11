import React from "react";

const SIZES = {
  sm: { height: "32px", padding: "0 12px", fontSize: "13px", gap: "6px", radius: "var(--radius-md)" },
  md: { height: "36px", padding: "0 16px", fontSize: "14px", gap: "8px", radius: "var(--radius-md)" },
  lg: { height: "44px", padding: "0 22px", fontSize: "15px", gap: "8px", radius: "var(--radius-md)" },
  icon: { height: "36px", width: "36px", padding: "0", fontSize: "14px", gap: "0", radius: "var(--radius-md)" },
};

const VARIANTS = {
  primary:   { background: "var(--primary)", color: "var(--primary-foreground)", border: "1px solid transparent", hover: "var(--primary-hover)" },
  accent:    { background: "var(--accent)", color: "var(--accent-foreground)", border: "1px solid transparent", hover: "var(--accent-hover)" },
  secondary: { background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid transparent", hover: "var(--secondary-hover)" },
  outline:   { background: "var(--paper)", color: "var(--text-strong)", border: "1px solid var(--border-strong)", hover: "var(--grey-50)" },
  ghost:     { background: "transparent", color: "var(--text-body)", border: "1px solid transparent", hover: "var(--grey-100)" },
  link:      { background: "transparent", color: "var(--primary)", border: "1px solid transparent", hover: "transparent" },
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  type = "button",
  children,
  style,
  ...rest
}) {
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const [hover, setHover] = React.useState(false);

  return (
    <button
      type={type}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: s.gap,
        height: s.height,
        width: size === "icon" ? s.width : fullWidth ? "100%" : undefined,
        padding: s.padding,
        fontFamily: "var(--font-sans)",
        fontSize: s.fontSize,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: v.color,
        background: hover && !disabled ? v.hover : v.background,
        border: v.border,
        borderRadius: s.radius,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textDecoration: variant === "link" && hover ? "underline" : "none",
        transition: "background var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)",
        transform: hover && !disabled && variant !== "link" ? "translateY(-1px)" : "none",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
