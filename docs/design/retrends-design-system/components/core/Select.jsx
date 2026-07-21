import React from "react";
import { Icon } from "../Icon.jsx";

/** Lightweight styled select (native <select> under the hood for reliability). */
export function Select({ label, hint, options = [], size = "md", style, id, ...rest }) {
  const reactId = React.useId();
  const selectId = id || reactId;
  const h = size === "lg" ? "44px" : size === "sm" ? "32px" : "36px";
  const [focus, setFocus] = React.useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "var(--font-sans)" }}>
      {label && (
        <label htmlFor={selectId} style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>
          {label}
        </label>
      )}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: h,
          background: "var(--input-bg)",
          border: `1px solid ${focus ? "var(--ring)" : "var(--border-strong)"}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "0 0 0 var(--ring-width) var(--ring-color)" : "none",
          transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        }}
      >
        <select
          id={selectId}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            flex: 1,
            height: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            padding: "0 36px 0 12px",
            fontFamily: "var(--font-sans)",
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--text-strong)",
            cursor: "pointer",
            ...style,
          }}
          {...rest}
        >
          {options.map((o) => {
            const value = typeof o === "string" ? o : o.value;
            const labelText = typeof o === "string" ? o : o.label;
            return <option key={value} value={value}>{labelText}</option>;
          })}
        </select>
        <span style={{ position: "absolute", right: "11px", color: "var(--text-muted)", pointerEvents: "none", display: "flex" }}>
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
      {hint && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{hint}</span>}
    </div>
  );
}
