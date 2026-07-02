import { describe, it, expect } from 'vitest';
import { shouldRequestFullscreen } from './telegram';

describe('shouldRequestFullscreen', () => {
  it('true only for ios/android with the API available', () => {
    expect(shouldRequestFullscreen('ios', true)).toBe(true);
    expect(shouldRequestFullscreen('android', true)).toBe(true);
  });
  it('false on desktop platforms even with the API', () => {
    for (const p of ['tdesktop', 'macos', 'web', 'weba', undefined]) {
      expect(shouldRequestFullscreen(p, true)).toBe(false);
    }
  });
  it('false without the API', () => {
    expect(shouldRequestFullscreen('ios', false)).toBe(false);
  });
});
