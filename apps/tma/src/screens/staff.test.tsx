import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaffList } from './Staff';
import type { StaffTableRow } from '@altegio/shared';

const rows: StaffTableRow[] = [
  { staffId: 1, name: 'Алиса', revenue: 300000, visits: 12, avgCheck: 25000, cancelPct: 8, utilizationPct: 74, newClients: 3, revenuePerHour: 18000 },
];

describe('StaffList', () => {
  it('renders a master row with revenue and utilization', () => {
    const html = renderToString(<StaffList rows={rows} onOpen={() => {}} trends={{}} />);
    expect(html).toContain('Алиса');
    expect(html).toContain('74%');
  });
});
