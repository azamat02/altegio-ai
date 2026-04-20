import { ServicesParser } from './services.parser';

describe('ServicesParser', () => {
  const p = new ServicesParser();
  it('coerces active 0 → false, 1 → true, default true', () => {
    expect(p.toRow('t', { id: 1, title: 's', active: 1 } as any).active).toBe(true);
    expect(p.toRow('t', { id: 2, title: 's', active: 0 } as any).active).toBe(false);
    expect(p.toRow('t', { id: 3, title: 's' } as any).active).toBe(true);
  });
});
