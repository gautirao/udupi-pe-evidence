import React from "react";

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  trailingIcon,
  size = "md",
  id,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === "lg" ? "44px" : size === "sm" ? "32px" : "36px";
  const reactId = React.useId();
  const inputId = id || reactId;
  const borderColor = error
    ? "var(--negative)"
    : focus
    ? "var(--ring)"
    : "var(--border-strong)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "var(--font-sans)" }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          height: h,
          padding: "0 12px",
          background: "var(--input-bg)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? `0 0 0 var(--ring-width) var(--ring-color)` : "none",
          transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        }}
      >
        {leadingIcon && <span style={{ color: "var(--text-muted)", display: "flex" }}>{leadingIcon}</span>}
        <input
          id={inputId}
          onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
          onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontSize: "14px",
            color: "var(--text-strong)",
            ...style,
          }}
          {...rest}
        />
        {trailingIcon && <span style={{ color: "var(--text-muted)", display: "flex" }}>{trailingIcon}</span>}
      </div>
      {(hint || error) && (
        <span style={{ fontSize: "12px", color: error ? "var(--negative)" : "var(--text-muted)" }}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
