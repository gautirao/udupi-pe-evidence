import { ClipboardCheck, FileText, Handshake } from 'lucide-react';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────────────────
// "How we keep listings honest" curation-practices section (Issue #2399).
// Static content, colocated with its owning section.
//
// Describes what we actually do today — no "verified"/badge claims the data
// cannot back (all current listings are trust tier D, so no badge renders).
// ────────────────────────────────────────────────────────────────────────────

interface PracticeCard {
  icon: React.ReactNode;
  iconWrap: string;
  title: string;
  description: string;
}

const CURATION_PRACTICES: PracticeCard[] = [
  {
    icon: <Handshake className="h-5 w-5 text-green-600" />,
    iconWrap: 'bg-green-100',
    title: 'Personally onboarded brokers',
    description: 'We meet and onboard each founding broker ourselves during early access.',
  },
  {
    icon: <ClipboardCheck className="h-5 w-5 text-blue-600" />,
    iconWrap: 'bg-blue-100',
    title: 'Founder-managed listings',
    description:
      'Our small founding team personally manages and keeps an eye on the listings we publish during early access.',
  },
  {
    icon: <FileText className="h-5 w-5 text-slate-500" />,
    iconWrap: 'bg-slate-100',
    title: 'RERA number provided by seller',
    description:
      'Where a RERA number is available, we show the one the seller provided for you to check yourself.',
  },
];

export function LandingTrustSection() {
  return (
    <section className="container mx-auto max-w-7xl px-4 py-20">
      <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-br from-blue-50 to-green-50 p-8 sm:p-10">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
            <Handshake className="h-5 w-5 text-blue-600" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">
              How we keep listings honest
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Curated early access — here&apos;s exactly what that means today
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CURATION_PRACTICES.map((b) => (
            <div key={b.title} className="rounded-xl bg-white p-5 shadow-sm">
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', b.iconWrap)}>
                {b.icon}
              </span>
              <h3 className="mt-4 font-semibold text-foreground">{b.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
