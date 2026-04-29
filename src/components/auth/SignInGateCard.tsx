import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export interface SignInGateCardProps {
  /** Shown as the `<h3>` inside the overlay variant. Not rendered in card variant. */
  heading?: string;
  description?: string;
  ctaLabel?: string;
  returnTo: string;
  variant?: 'overlay' | 'card';
}

/**
 * Reusable sign-in gate UI.
 *
 * - `overlay`: absolute-positioned dark overlay (e.g. gallery lock screen).
 *   Must be placed inside a `relative` parent.
 * - `card`: bordered card block (e.g. sidebar CTA).
 */
export function SignInGateCard({
  heading,
  description,
  ctaLabel = 'Sign in',
  returnTo,
  variant = 'card',
}: SignInGateCardProps) {
  if (variant === 'overlay') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="max-w-sm px-6 text-center text-white">
          <Lock className="mx-auto mb-4 h-12 w-12" aria-hidden="true" />
          {heading && <h3 className="mb-2 text-xl font-semibold">{heading}</h3>}
          {description && (
            <p className="mb-4 text-sm text-gray-200">{description}</p>
          )}
          <Button variant="secondary" size="lg" asChild>
            <Link to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}>{ctaLabel}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // variant === 'card'
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 text-center">
        <Lock className="h-6 w-6 mx-auto mb-2 text-primary/60" aria-hidden="true" />
        {description && (
          <p className="text-sm text-muted-foreground mb-3">{description}</p>
        )}
        <Button className="w-full" asChild>
          <Link to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}>{ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
