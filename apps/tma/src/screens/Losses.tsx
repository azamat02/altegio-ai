import { useEffect, useState } from 'react';
import type { TmaLosses } from '@altegio/shared';
import { api } from '../api';
import { tg } from '../format';
import { PeriodSelector, range, type PeriodKind } from '../components/PeriodSelector';

function LossCard({ title, context, period, annual }: { title: string; context: string; period: number; annual: number }) {
  return (
    <div className="card">
      <div className="row"><strong>{title}</strong><span className="num">{tg(period)}</span></div>
      <div className="muted small">{context}</div>
      <div className="muted small">{`≈ ${tg(annual)} в год`}</div>
    </div>
  );
}

export function LossesView({ data: d }: { data: TmaLosses }) {
  return (
    <div className="stack">
      <div className="card card--hero">
        <div className="muted">Вы теряете примерно</div>
        <div className="hero num">{`${tg(d.totalAnnual)} в год`}</div>
      </div>
      <LossCard title="Отмены" context={`${d.cancellations.count} отмен за период`} period={d.cancellations.period} annual={d.cancellations.annual} />
      <LossCard title="Не пришли" context={`${d.noShow.count} no-show за период`} period={d.noShow.period} annual={d.noShow.annual} />
      <LossCard title="Простой" context={`${d.idle.idleHours} свободных часов до загрузки ${d.idle.targetUtilizationPct}%`} period={d.idle.period} annual={d.idle.annual} />
      <LossCard title="Отток" context={`${d.churn.sleepingCount} спящих клиентов · при возврате ${d.churn.returnRatePct}%`} period={d.churn.period} annual={d.churn.annual} />
      <p className="muted small">Оценка по данным выбранного периода, не бухгалтерия.</p>
    </div>
  );
}

export function Losses() {
  const [period, setPeriod] = useState<PeriodKind>('30d');
  const [data, setData] = useState<TmaLosses | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const { from, to } = range(period);
    let stale = false;
    setData(null);
    setFailed(false);
    api.get<TmaLosses>(`/tma/losses?from=${from}&to=${to}`)
      .then((d) => { if (!stale) setData(d); })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [period]);
  return (
    <div className="stack">
      <h1 className="serif">Потери</h1>
      <PeriodSelector value={period} onChange={setPeriod} />
      {failed && <p className="muted">Не удалось загрузить. Попробуйте ещё раз.</p>}
      {!failed && !data && <p className="muted">Загрузка…</p>}
      {data && <LossesView data={data} />}
    </div>
  );
}
