// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { TmaClients } from '@altegio/shared';

type Pending = { path: string; resolve: (v: TmaClients) => void; reject: (e: Error) => void };
const pending: Pending[] = [];

vi.mock('../api', () => ({
  api: {
    get: (path: string) =>
      new Promise((resolve, reject) => { pending.push({ path, resolve, reject }); }),
  },
}));

import { Clients } from './Clients';

const mk = (total: number): TmaClients => ({
  totalClients: total, sleepingCount: 0, almostLostCount: 0, sleeping: [], top: [],
});

beforeEach(() => { pending.length = 0; });
afterEach(() => { cleanup(); });

describe('Clients container', () => {
  it('walks loading → error → data', async () => {
    render(<Clients />);
    expect(screen.getByText('Загрузка…')).toBeTruthy();

    await act(async () => { pending[0].reject(new Error('HTTP 500')); });
    expect(screen.getByText('Не удалось загрузить. Попробуйте ещё раз.')).toBeTruthy();

    fireEvent.click(screen.getByText('30+ дней')); // re-fetch resets the error
    expect(screen.getByText('Загрузка…')).toBeTruthy();
    await act(async () => { pending[1].resolve(mk(777)); });
    expect(screen.getByText('777')).toBeTruthy();
  });

  it('ignores a stale response that resolves after a newer request', async () => {
    render(<Clients />);
    expect(pending[0].path).toContain('sleepingDays=60');

    fireEvent.click(screen.getAllByText('90+ дней')[0]);
    expect(pending[1].path).toContain('sleepingDays=90');

    // Newer request resolves first…
    await act(async () => { pending[1].resolve(mk(999)); });
    expect(screen.getByText('999')).toBeTruthy();

    // …then the stale one lands and must be dropped.
    await act(async () => { pending[0].resolve(mk(111)); });
    expect(screen.getByText('999')).toBeTruthy();
    expect(screen.queryByText('111')).toBeNull();
  });

  it('shows loading (not stale data) while switching pills', async () => {
    render(<Clients />);
    await act(async () => { pending[0].resolve(mk(555)); });
    expect(screen.getByText('555')).toBeTruthy();

    fireEvent.click(screen.getAllByText('90+ дней')[0]);
    expect(screen.getByText('Загрузка…')).toBeTruthy();
    expect(screen.queryByText('555')).toBeNull();
  });
});
