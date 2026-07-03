import { composeLosses, type LossIngredients } from './losses';

const base: LossIngredients = {
  revenue: 3_000_000, visits: 100, cancelled: 10,
  noShowCount: 5, noShowLost: 120_000,
  bookedMin: 6_000, capacityMin: 12_000, // 100h booked / 200h capacity
  sleepingCount: 40, avgCheck: 30_000,
};

describe('composeLosses', () => {
  it('computes the four blocks and the annual total for a 30-day period (default 80% target)', () => {
    const l = composeLosses(base, 30);
    expect(l.periodDays).toBe(30);
    expect(l.cancellations).toEqual({ count: 10, period: 300_000, annual: 3_650_000 });
    expect(l.noShow).toEqual({ count: 5, period: 120_000, annual: 1_460_000 });
    // target minutes = 12_000 × 0.8 = 9_600; idle = (9_600 − 6_000)/60 = 60h
    // revenuePerHour = 3_000_000 / 100h = 30_000; idle = 60h × 30_000 = 1_800_000
    expect(l.idle).toEqual({ idleHours: 60, targetUtilizationPct: 80, period: 1_800_000, annual: 21_900_000 });
    // churn = 40 × 30_000 × 0.3 = 360_000
    expect(l.churn).toEqual({ sleepingCount: 40, returnRatePct: 30, period: 360_000, annual: 4_380_000 });
    expect(l.totalAnnual).toBe(3_650_000 + 1_460_000 + 21_900_000 + 4_380_000);
  });

  it('target 100% reproduces the raw free-hours model', () => {
    const l = composeLosses(base, 30, 100);
    expect(l.idle).toEqual({ idleHours: 100, targetUtilizationPct: 100, period: 3_000_000, annual: 36_500_000 });
  });

  it('idle is 0 when booking already meets the target', () => {
    // booked 10_000 min > target 9_600 min
    const l = composeLosses({ ...base, bookedMin: 10_000 }, 30);
    expect(l.idle.period).toBe(0);
    expect(l.idle.idleHours).toBe(0);
  });

  it('idle block is 0 when there is no booked time or no capacity', () => {
    expect(composeLosses({ ...base, bookedMin: 0 }, 30).idle.period).toBe(0);
    expect(composeLosses({ ...base, capacityMin: 0 }, 30).idle.period).toBe(0);
  });

  it('idle never negative when overbooked', () => {
    expect(composeLosses({ ...base, bookedMin: 20_000 }, 30).idle.period).toBe(0);
  });

  it('projects a 1-day period ×365', () => {
    expect(composeLosses(base, 1).cancellations.annual).toBe(300_000 * 365);
  });

  it('computes idle money from exact fractional hours (display hours rounded)', () => {
    // capacity 6_090 min, target 100% → target−booked = 90 min = 1.5h
    // revenuePerHour = 3_000_000/100h = 30_000
    const l = composeLosses({ ...base, capacityMin: 6_090 }, 30, 100);
    expect(l.idle.idleHours).toBe(2);   // display rounds 1.5 → 2
    expect(l.idle.period).toBe(45_000); // money uses exact 1.5 × 30_000
  });
});
