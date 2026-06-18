import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/** Styled dropdown built on a native <select> for reliable behavior. */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Field label rendered above. */
  label?: string;
  /** Helper text below. */
  hint?: string;
  /** Options as strings or {value,label} objects. */
  options?: (string | SelectOption)[];
  /** Control height. Default "md". */
  size?: "sm" | "md" | "lg";
}

export function Select(props: SelectProps): JSX.Element;
