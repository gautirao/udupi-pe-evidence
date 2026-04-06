import { Card, CardHeader, CardContent } from '@/components/ui/card';

interface Props {
  activity: { activeCount: number; new30d: number } | null;
  confidence: string;
}

export function MarketActivity({ activity, confidence }: Props) {
  if (confidence === 'fallback' || activity === null) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-base font-semibold">Market activity</h3>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Active listings</p>
            <p className="text-2xl font-bold tabular-nums">{activity.activeCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">New this month</p>
            <p className="text-2xl font-bold tabular-nums">{activity.new30d}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
