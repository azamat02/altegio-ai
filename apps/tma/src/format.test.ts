import { describe, it, expect } from 'vitest';
import { tg, tgShort, pct } from './format';

describe('format', () => {
  it('groups thousands', () => {
    expect(tg(1240000)).toBe('1 240 000 ₸');
  });
  it('signs percent', () => {
    expect(pct(18)).toBe('+18%');
    expect(pct(null)).toBe('—');
  });
});

describe('tgShort', () => {
  it('abbreviates billions with two decimals, comma separator', () => {
    expect(tgShort(1_848_235_000)).toBe('1,85 млрд ₸');
  });
  it('drops trailing zeros', () => {
    expect(tgShort(1_800_000_000)).toBe('1,8 млрд ₸');
    expect(tgShort(46_000_000)).toBe('46 млн ₸');
  });
  it('abbreviates millions with one decimal', () => {
    expect(tgShort(2_400_000)).toBe('2,4 млн ₸');
    expect(tgShort(45_990_000)).toBe('46 млн ₸');
  });
  it('keeps full form below a million', () => {
    expect(tgShort(300_000)).toBe('300 000 ₸');
  });
});

import { initDataFromHash } from './telegram';

describe('initDataFromHash', () => {
  it('extracts and decodes tgWebAppData from the launch hash', () => {
    const raw = 'auth_date%3D1%26user%3D%257B%2522id%2522%253A42%257D%26hash%3Dabc';
    expect(initDataFromHash(`#tgWebAppData=${raw}&tgWebAppVersion=7.0`)).toBe(decodeURIComponent(raw));
  });
  it('returns empty string when absent', () => {
    expect(initDataFromHash('#tgWebAppVersion=7.0')).toBe('');
    expect(initDataFromHash('')).toBe('');
  });
});
