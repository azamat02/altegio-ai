import { useEffect, useState } from 'react';
import type { StaffTableRow, TrendPoint } from '@altegio/shared';
import { api } from '../api';
import { tg } from '../format';
import { Sparkline } from '../components/Sparkline';
import { PeriodSelector, range, type PeriodKind } from '../components/PeriodSelector';

export function StaffList({ rows, trends, onOpen }: {
  rows: StaffTableRow[];
  trends: Record<number, TrendPoint[]>;
  onOpen: (id: number) => void;
}) {
  return (
    <div className="stack">
      {rows.map((r) => (
        <div className="card" key={r.staffId} onClick={() => onOpen(r.staffId)}>
          <div className="row"><strong>{r.name}</strong><span className="num">{tg(r.revenue)}</span></div>
          <div className="muted small">
            визитов {r.visits} · чек {tg(r.avgCheck)} · отмен {r.cancelPct}%
            {r.utilizationPct != null && ` · загрузка ${r.utilizationPct}%`} · новых {r.newClients}
          </div>
          {trends[r.staffId] && <Sparkline points={trends[r.staffId]} />}
        </div>
      ))}
    </div>
  );
}

export function Staff() {
  const [period, setPeriod] = useState<PeriodKind>('30d');
  const [rows, setRows] = useState<StaffTableRow[]>([]);
  const [trends, setTrends] = useState<Record<number, TrendPoint[]>>({});
  useEffect(() => {
    const { from, to } = range(period);
    api.get<StaffTableRow[]>(`/tma/staff?from=${from}&to=${to}`).then(setRows).catch(() => setRows([]));
  }, [period]);
  const open = (id: number) => {
    if (trends[id]) return;
    api.get<{ series: TrendPoint[] }>(`/tma/staff/${id}/trend?days=30`)
      .then((r) => setTrends((t) => ({ ...t, [id]: r.series }))).catch(() => {});
  };
  return (
    <div className="stack">
      <h1 className="serif">Мастера</h1>
      <PeriodSelector value={period} onChange={setPeriod} />
      <StaffList rows={rows} trends={trends} onOpen={open} />
    </div>
  );
}
