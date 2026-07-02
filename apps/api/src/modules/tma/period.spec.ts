import { previousWindow, inclusiveDays } from './period';

describe('previousWindow', () => {
  it('returns the adjacent window of equal inclusive length', () => {
    // 7-day window 2026-06-24..2026-06-30 → previous is 2026-06-17..2026-06-23
    expect(previousWindow('2026-06-24', '2026-06-30')).toEqual({ from: '2026-06-17', to: '2026-06-23' });
  });
  it('handles a 1-day window', () => {
    expect(previousWindow('2026-07-01', '2026-07-01')).toEqual({ from: '2026-06-30', to: '2026-06-30' });
  });
  it('crosses month boundaries', () => {
    // 2026-07-01..2026-07-03 (3 days) → 2026-06-28..2026-06-30
    expect(previousWindow('2026-07-01', '2026-07-03')).toEqual({ from: '2026-06-28', to: '2026-06-30' });
  });
});

describe('inclusiveDays', () => {
  it('counts both endpoints', () => {
    expect(inclusiveDays('2026-06-01', '2026-06-30')).toBe(30);
    expect(inclusiveDays('2026-07-01', '2026-07-01')).toBe(1);
  });
});
