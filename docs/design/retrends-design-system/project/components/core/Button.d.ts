import * as React from "react";

/**
 * ReTrends button. Ink-navy `primary` is the workhorse; `accent` (restrained copper) is
 * reserved for the single most important CTA on a view.
 *
 * @startingPoint section="Core" subtitle="Primary, accent, outline & ghost buttons in 4 sizes" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Default "primary". */
  variant?: "primary" | "accent" | "secondary" | "outline" | "ghost" | "link";
  /** Control size. Default "md". Use "icon" for square icon-only buttons. */
  size?: "sm" | "md" | "lg" | "icon";
  /** Stretch to fill the container width. */
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
