import type { TrendPoint } from '@altegio/shared';

export function Sparkline({ points }: { points: TrendPoint[] }) {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p.revenue);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 200, H = 36, pad = 2;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - 2 * pad));
  const ys = vals.map((v) => H - pad - ((v - min) / range) * (H - 2 * pad));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const fillPts = `${xs[0]},${H} ${pts} ${xs[xs.length - 1]},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" preserveAspectRatio="none">
      <polygon points={fillPts} fill="var(--chart-fill)" />
      <polyline points={pts} fill="none" stroke="var(--chart-line)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
