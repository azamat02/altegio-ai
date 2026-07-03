export const tg = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';

// Compact money for hero/projection figures: ten serif digits are unreadable,
// «1,85 млрд ₸» is not. Full-precision tg() stays for line items.
const trimZeros = (s: string): string => s.replace(/(,\d*?)0+$/, '$1').replace(/,$/, '');

export const tgShort = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trimZeros((n / 1e9).toFixed(2).replace('.', ','))} млрд ₸`;
  if (abs >= 1e6) return `${trimZeros((n / 1e6).toFixed(1).replace('.', ','))} млн ₸`;
  return tg(n);
};

export const pct = (n: number | null): string =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n}%`;
