import { Link } from 'react-router-dom';
import { Eye, FileEdit, List, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface WorkspaceDescriptor {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  iconContainerClassName: string;
  to?: string;
}

const WORKSPACES: WorkspaceDescriptor[] = [
  {
    title: 'My Listings',
    description: 'Browse and manage all listings',
    icon: List,
    iconClassName: 'text-primary',
    iconContainerClassName: 'bg-primary/10',
    to: '/broker/listings',
  },
  {
    title: 'Drafts',
    description: 'Continue editing unpublished listings',
    icon: FileEdit,
    iconClassName: 'text-gray-600',
    iconContainerClassName: 'bg-gray-100',
    to: '/broker/listings?status=DRAFT',
  },
  {
    title: 'Engagement',
    description: 'Engagement tracking coming soon',
    icon: Eye,
    iconClassName: 'text-muted-foreground',
    iconContainerClassName: 'bg-muted',
  },
  {
    title: 'Demand Gaps',
    description: 'Limited data — coming in a future update',
    icon: TrendingUp,
    iconClassName: 'text-muted-foreground',
    iconContainerClassName: 'bg-muted',
  },
];

function WorkspaceCard({ workspace }: { workspace: WorkspaceDescriptor }) {
  const Icon = workspace.icon;
  const card = (
    <Card
      className={
        workspace.to
          ? 'hover:shadow-md transition-shadow cursor-pointer h-full'
          : 'h-full opacity-60 cursor-default'
      }
    >
      <CardContent className="p-4 flex flex-col items-start gap-2">
        <div className={`p-2 rounded-lg ${workspace.iconContainerClassName}`}>
          <Icon className={`h-5 w-5 ${workspace.iconClassName}`} />
        </div>
        <div>
          <p
            className={`text-sm font-semibold ${
              workspace.to ? '' : 'text-muted-foreground'
            }`}
          >
            {workspace.title}
          </p>
          <p className="text-xs text-muted-foreground">{workspace.description}</p>
        </div>
      </CardContent>
    </Card>
  );

  return workspace.to ? (
    <Link to={workspace.to} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

export function DashboardNavigation() {
  return (
    <section className="mb-6" aria-labelledby="broker-workspaces-heading">
      <h2 id="broker-workspaces-heading" className="text-base font-semibold text-primary mb-3">
        Broker workspaces
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {WORKSPACES.map((workspace) => (
          <WorkspaceCard key={workspace.title} workspace={workspace} />
        ))}
      </div>
    </section>
  );
}
