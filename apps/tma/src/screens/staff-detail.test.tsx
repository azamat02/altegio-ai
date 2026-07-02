import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaffDetailView } from './StaffDetailScreen';
import type { StaffDetail } from '@altegio/shared';

const detail: StaffDetail = {
  staffId: 1, name: 'Алиса', revenue: 300000, visits: 12, avgCheck: 25000,
  utilizationPct: 74, newClients: 3, returningClients: 9, cancelled: 1, noShow: 2,
  services: [{ title: 'Брови', visits: 8, revenue: 200000 }],
  trend: Array.from({ length: 30 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, revenue: 10000 })),
};

describe('StaffDetailView', () => {
  it('renders header numbers, services and client split', () => {
    const html = renderToString(<StaffDetailView detail={detail} />);
    expect(html).toContain('Алиса');
    expect(html).toContain('Брови');
    expect(html).toContain('74%');
    expect(html).toContain('новых 3');
  });
});
