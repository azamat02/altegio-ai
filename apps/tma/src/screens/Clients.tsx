import { useEffect, useState } from 'react';
import type { TmaClients } from '@altegio/shared';
import { api } from '../api';
import { tg } from '../format';

type SleepDays = 30 | 60 | 90;

export function ClientsView({ data: d }: { data: TmaClients }) {
  return (
    <div className="stack">
      <div className="grid3">
        <div className="card tight"><div className="muted small">Всего</div><div className="num">{d.totalClients}</div></div>
        <div className="card tight"><div className="muted small">Спящих</div><div className="num">{d.sleepingCount}</div></div>
        {/* Design note: the «90+ дней» counter is intentionally fixed at the 90-day
            cutoff regardless of the sleeping-threshold pill — it answers "how many are
            almost lost", not "how many match the current filter". */}
        <div className="card tight"><div className="muted small">90+ дней</div><div className="num">{d.almostLostCount}</div></div>
      </div>
      <div className="card">
        <div className="muted small">Спящие — позвонить и вернуть</div>
        {d.sleeping.map((c, i) => (
          <div className="row" key={i}>
            <div>
              <div>{c.name ?? 'Без имени'}</div>
              <div className="muted small">{`${c.daysSince} дн. назад · ${c.visits} визитов · ${tg(c.spent)}`}</div>
            </div>
            {c.phone && <a href={`tel:${c.phone}`} className="badge up">Позвонить</a>}
          </div>
        ))}
        {d.sleeping.length === 0 && <div className="muted small">Нет спящих клиентов — отлично!</div>}
      </div>
      <div className="card">
        <div className="muted small">Топ клиентов</div>
        {d.top.map((c, i) => (
          <div className="row" key={i}>
            <span>{c.name ?? 'Без имени'}</span>
            <span className="muted">{`${c.visits} · ${tg(c.spent)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Clients() {
  const [days, setDays] = useState<SleepDays>(60);
  const [data, setData] = useState<TmaClients | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stale = false;
    setData(null);
    setFailed(false);
    api.get<TmaClients>(`/tma/clients?sleepingDays=${days}`)
      .then((d) => { if (!stale) setData(d); })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [days]);
  return (
    <div className="stack">
      <h1 className="serif">Клиенты</h1>
      <div className="pills">
        {([30, 60, 90] as SleepDays[]).map((n) => (
          <button key={n} className={`pill ${days === n ? 'on' : ''}`} onClick={() => setDays(n)}>{`${n}+ дней`}</button>
        ))}
      </div>
      {failed && <p className="muted">Не удалось загрузить. Попробуйте ещё раз.</p>}
      {!failed && !data && <p className="muted">Загрузка…</p>}
      {data && <ClientsView data={data} />}
    </div>
  );
}
