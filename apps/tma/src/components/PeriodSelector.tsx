export type PeriodKind = '7d' | '30d' | 'month';

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function range(kind: PeriodKind): { from: string; to: string } {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const to = fmt(yesterday);
  if (kind === 'month') {
    return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  }
  const days = kind === '7d' ? 7 : 30;
  const from = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
  return { from, to };
}

export function PeriodSelector({ value, onChange }: { value: PeriodKind; onChange: (k: PeriodKind) => void }) {
  const opts: [PeriodKind, string][] = [['7d', '7 дней'], ['30d', '30 дней'], ['month', 'Этот месяц']];
  return (
    <div className="pills">
      {opts.map(([k, label]) => (
        <button key={k} className={`pill ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
