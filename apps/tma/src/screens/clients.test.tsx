// apps/tma/src/screens/clients.test.tsx
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ClientsView } from './Clients';
import type { TmaClients } from '@altegio/shared';

const data: TmaClients = {
  totalClients: 120, sleepingCount: 30, almostLostCount: 12,
  sleeping: [{ name: 'Айгерим', phone: '+77001234567', daysSince: 75, visits: 11, spent: 1850000 }],
  top: [{ name: 'Динара', phone: '+77007654321', visits: 6, spent: 920000 }],
};

describe('ClientsView', () => {
  it('renders counters, a tel: link for the sleeping client, and the LTV top', () => {
    const html = renderToString(<ClientsView data={data} />);
    expect(html).toContain('120');
    expect(html).toContain('tel:+77001234567');
    expect(html).toContain('Айгерим');
    expect(html).toContain('Динара');
    expect(html).toContain('75');
  });
});
