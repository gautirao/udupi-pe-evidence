import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

export interface EmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  description?: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: 'default' | 'outline';
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant}>
        <Link to={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon,
  heading,
  description,
  primaryAction,
  secondaryAction,
  size = 'md',
  children,
}: EmptyStateProps) {
  const containerSize =
    size === 'sm'
      ? 'w-10 h-10'
      : 'w-16 h-16';

  const headingClass =
    size === 'sm'
      ? 'font-semibold text-sm text-foreground mb-1'
      : 'font-semibold text-base text-foreground mb-2';

  const hasActions = primaryAction || secondaryAction;

  return (
    <div className="text-center">
      <div
        className={cn(
          'bg-muted rounded-full flex items-center justify-center mx-auto mb-4',
          containerSize,
        )}
      >
        {icon}
      </div>
      <h3 className={headingClass}>{heading}</h3>
      {description && (
        <p
          data-testid="empty-state-description"
          className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto"
        >
          {description}
        </p>
      )}
      {hasActions && (
        <div className="flex flex-col items-center gap-2">
          {primaryAction && (
            <ActionButton action={primaryAction} variant="default" />
          )}
          {secondaryAction && (
            <ActionButton action={secondaryAction} variant="outline" />
          )}
        </div>
      )}
      {children}
    </div>
  );
}
