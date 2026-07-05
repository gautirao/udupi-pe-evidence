import React from "react";

/**
 * Surface card. The ReTrends workhorse container: white paper, soft border,
 * subtle shadow that lifts on hover when `interactive`.
 */
export function Card({ interactive = false, padding = "lg", children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const pad = padding === "none" ? "0" : padding === "sm" ? "var(--space-4)" : padding === "md" ? "var(--space-5)" : "var(--space-6)";

  return (
    <div
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: pad,
        boxShadow: hover ? "var(--shadow-lg)" : "var(--shadow-sm)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        cursor: interactive ? "pointer" : "default",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, style, ...rest }) {
  return (
    <h3 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-strong)", ...style }} {...rest}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, style, ...rest }) {
  return (
    <p style={{ margin: "4px 0 0", fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.5, ...style }} {...rest}>
      {children}
    </p>
  );
}
