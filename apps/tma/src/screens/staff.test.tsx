import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaffList } from './Staff';
import type { StaffCompareRow } from '@altegio/shared';

const rows: StaffCompareRow[] = [
  { staffId: 1, name: 'Алиса', revenue: 300000, visits: 12, avgCheck: 25000, cancelPct: 8, utilizationPct: 74, newClients: 3, revenuePerHour: 18000, prevRevenue: 250000, deltaPct: 20 },
];

describe('StaffList', () => {
  it('renders a master row with revenue and utilization', () => {
    const html = renderToString(<StaffList rows={rows} onOpen={() => {}} trends={{}} />);
    expect(html).toContain('Алиса');
    expect(html).toContain('74%');
  });

  it('renders a delta badge and totals', () => {
    const html = renderToString(
      <StaffList rows={rows} onOpen={() => {}} trends={{}} />,
    );
    expect(html).toContain('+20%');
  });
});
