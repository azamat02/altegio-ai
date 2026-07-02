import { describe, it, expect } from 'vitest';
import { tg, pct } from './format';

describe('format', () => {
  it('groups thousands', () => {
    expect(tg(1240000)).toBe('1 240 000 ₸');
  });
  it('signs percent', () => {
    expect(pct(18)).toBe('+18%');
    expect(pct(null)).toBe('—');
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
