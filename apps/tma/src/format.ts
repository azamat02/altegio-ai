export const tg = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';

export const pct = (n: number | null): string =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n}%`;
