import { useEffect, useState } from 'react';
import type { StaffDetail } from '@altegio/shared';
import { api } from '../api';
import { tg } from '../format';
import { RevenueChart } from '../components/RevenueChart';
import { range, type PeriodKind } from '../components/PeriodSelector';

export function StaffDetailView({ detail: d }: { detail: StaffDetail }) {
  return (
    <div className="stack">
      <h1 className="serif">{d.name}</h1>
      <div className="card">
        <div className="row"><span className="muted">Выручка</span><strong className="num">{tg(d.revenue)}</strong></div>
        <div className="muted small">
          визитов {d.visits} · чек {tg(d.avgCheck)}
          {d.utilizationPct != null && ` · загрузка ${d.utilizationPct}%`}
        </div>
        <RevenueChart points={d.trend} />
      </div>
      <div className="card">
        <div className="muted small">Клиенты за период</div>
        <div>{`новых ${d.newClients} · вернувшихся ${d.returningClients}`}</div>
        <div className="muted small">отмен {d.cancelled} · не пришли {d.noShow}</div>
      </div>
      <div className="card">
        <div className="muted small">Топ услуг</div>
        {d.services.map((s) => (
          <div className="row" key={s.title}>
            <span>{s.title}</span>
            <span className="muted">{s.visits} · {tg(s.revenue)}</span>
          </div>
        ))}
        {d.services.length === 0 && <div className="muted small">Нет завершённых услуг за период.</div>}
      </div>
    </div>
  );
}

export function StaffDetailScreen({ staffId, period, onBack }: {
  staffId: number; period: PeriodKind; onBack: () => void;
}) {
  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const { from, to } = range(period);
    api.get<StaffDetail>(`/tma/staff/${staffId}/detail?from=${from}&to=${to}`)
      .then(setDetail).catch(() => setFailed(true));
  }, [staffId, period]);

  useEffect(() => {
    const bb = (window as any).Telegram?.WebApp?.BackButton;
    if (!bb) return;
    bb.show();
    bb.onClick(onBack);
    return () => { bb.offClick(onBack); bb.hide(); };
  }, [onBack]);

  return (
    <div className="stack">
      <button className="muted small" onClick={onBack} style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }}>
        ← Назад
      </button>
      {failed && <p className="muted">Не удалось загрузить. Попробуйте ещё раз.</p>}
      {!failed && !detail && <p className="muted">Загрузка…</p>}
      {detail && <StaffDetailView detail={detail} />}
    </div>
  );
}
