import * as React from "react";

/** White paper surface — the base container for everything in ReTrends. */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift + pointer cursor for clickable cards. */
  interactive?: boolean;
  /** Inner padding. Default "lg". */
  padding?: "none" | "sm" | "md" | "lg";
  children?: React.ReactNode;
}

export function Card(props: CardProps): JSX.Element;

/** Card heading (h3, 18/600). */
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>): JSX.Element;

/** Muted supporting line under a CardTitle. */
export function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>): JSX.Element;
