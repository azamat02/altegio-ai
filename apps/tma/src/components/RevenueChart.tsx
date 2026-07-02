import { useId } from 'react';
import type { TrendPoint } from '@altegio/shared';

interface RevenueChartProps {
  points: TrendPoint[];
}

export function RevenueChart({ points }: RevenueChartProps) {
  const gradId = useId();
  if (!points || points.length < 2) return null;

  const W = 400;
  const H = 72;
  const PAD = 2;

  const values = points.map((p) => p.revenue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const ys = values.map((v) => PAD + (1 - (v - min) / range) * (H - PAD * 2));

  const linePath = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(' ');

  const areaPath =
    `${linePath} L ${xs[xs.length - 1].toFixed(1)} ${(H + 2).toFixed(1)} L ${xs[0].toFixed(1)} ${(H + 2).toFixed(1)} Z`;

  // Highlight the last point
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '64px', display: 'block', marginTop: '12px', overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
        </linearGradient>
        <filter id="dot-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Latest data point dot */}
      <circle cx={lastX} cy={lastY} r="4" fill="var(--chart-line)" />
      <circle cx={lastX} cy={lastY} r="7" fill="var(--chart-line)" opacity="0.15" />
    </svg>
  );
}
