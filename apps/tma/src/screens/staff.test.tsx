import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaffList, StaffTotalsLine } from './Staff';
import type { StaffCompareRow, StaffCompareResponse } from '@altegio/shared';

const rows: StaffCompareRow[] = [
  { staffId: 1, name: 'Алиса', revenue: 300000, visits: 12, avgCheck: 25000, cancelPct: 8, utilizationPct: 74, newClients: 3, revenuePerHour: 18000, prevRevenue: 250000, deltaPct: 20 },
];

describe('StaffList', () => {
  // Single render shared across assertions in this describe block.
  const html = renderToString(<StaffList rows={rows} onOpen={() => {}} trends={{}} />);

  it('renders a master row with revenue, utilization, and a delta badge', () => {
    expect(html).toContain('Алиса');
    expect(html).toContain('74%');
    expect(html).toContain('+20%');
  });
});

describe('StaffTotalsLine', () => {
  const totals: StaffCompareResponse['totals'] = { revenue: 500000, prevRevenue: 600000, deltaPct: -5 };

  it('renders salon totals with revenue and a down delta badge', () => {
    const html = renderToString(<StaffTotalsLine totals={totals} />);
    expect(html).toContain('Салон:');
    expect(html).toContain('▼');
    expect(html).toContain('−5%');
  });

  it('renders totals with a null deltaPct as новый', () => {
    const html = renderToString(
      <StaffTotalsLine totals={{ revenue: 500000, prevRevenue: 0, deltaPct: null }} />,
    );
    expect(html).toContain('новый');
  });
});
