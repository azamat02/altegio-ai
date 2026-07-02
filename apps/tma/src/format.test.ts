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
