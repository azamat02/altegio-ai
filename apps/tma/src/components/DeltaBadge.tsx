export function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span className="badge muted">новый</span>;
  const up = deltaPct >= 0;
  const label = up ? `▲ +${deltaPct}%` : `▼ −${Math.abs(deltaPct)}%`;
  return (
    <span className={`badge ${up ? 'up' : 'down'}`}>
      {label}
    </span>
  );
}
