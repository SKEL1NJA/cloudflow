import { PageHeader } from '@/components/layout/page-header';
import { ExecutionChartCard } from './execution-chart-card';
import { HealthPanel } from './health-panel';
import { KpiCards } from './kpi-cards';
import { useRange } from './range';
import { RangeSwitch } from './range-switch';
import { RecentExecutions } from './recent-executions';

export function OverviewPage() {
  const [range, setRange] = useRange();

  return (
    <>
      <PageHeader
        title="Overview"
        description="System health and recent activity."
        actions={<RangeSwitch value={range} onChange={setRange} />}
      />
      <div className="space-y-6">
        <KpiCards range={range} />
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ExecutionChartCard range={range} />
          </div>
          <HealthPanel range={range} />
        </div>
        <RecentExecutions />
      </div>
    </>
  );
}
