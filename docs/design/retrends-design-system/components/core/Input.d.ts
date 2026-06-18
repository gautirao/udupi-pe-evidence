import * as React from "react";

/** Text input with optional label, hint/error, and leading/trailing icons. */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Field label rendered above the control. */
  label?: string;
  /** Helper text below the field. */
  hint?: string;
  /** Error message; overrides hint and turns the field red. */
  error?: string;
  /** Icon node placed inside, before the text (e.g. <Icon name="search" size={16} />). */
  leadingIcon?: React.ReactNode;
  /** Icon node placed inside, after the text. */
  trailingIcon?: React.ReactNode;
  /** Control height. Default "md". */
  size?: "sm" | "md" | "lg";
}

export function Input(props: InputProps): JSX.Element;
