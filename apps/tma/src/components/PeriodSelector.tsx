export type PeriodKind = '7d' | '30d' | 'month';

export function range(kind: PeriodKind): { from: string; to: string } {
  const today = new Date();
  const to = new Date(today.getTime() - 86400000).toISOString().slice(0, 10); // yesterday
  if (kind === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    return { from, to };
  }
  const days = kind === '7d' ? 7 : 30;
  const from = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
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
