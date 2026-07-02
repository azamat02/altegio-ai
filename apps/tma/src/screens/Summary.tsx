import type { TmaSummary } from '@altegio/shared';
import { tg, pct } from '../format';
import { RevenueChart } from '../components/RevenueChart';
import { KPI } from '../components/KPI';

export function Summary({ summary: s }: { summary: TmaSummary }) {
  const deltaPositive = s.deltaPct != null && s.deltaPct >= 0;
  const topInitial = s.topStaff ? s.topStaff.name.charAt(0).toUpperCase() : '';

  return (
    <div className="stack">
      {/* Header */}
      <header className="dashboard-header">
        <h1 className="serif">{s.salonName}</h1>
        <p className="subtitle">{s.date}</p>
      </header>

      {/* Revenue hero card */}
      <div className="card card--hero revenue-section">
        <div className="revenue-meta">
          <span className="revenue-label">Выручка</span>
          {s.deltaPct != null && (
            <span className={deltaPositive ? 'up' : 'down'}>
              {pct(s.deltaPct)} к норме
            </span>
          )}
        </div>
        <div className="hero num revenue-value">{tg(s.revenue)}</div>
        <RevenueChart points={s.revenue30d} />
      </div>

      {/* KPI grid */}
      <div className="grid2">
        <KPI label="Средний чек" value={s.avgCheck != null ? tg(s.avgCheck) : '—'} />
        <KPI label="Визитов" value={String(s.came)} />
      </div>

      {/* Additional KPIs */}
      {(s.cancelled > 0 || s.utilizationPct != null) && (
        <div className="grid2">
          {s.cancelled > 0 && (
            <KPI label="Отменено" value={String(s.cancelled)} />
          )}
          {s.utilizationPct != null && (
            <KPI label="Загрузка" value={`${Math.round(s.utilizationPct)}%`} />
          )}
        </div>
      )}

      {/* Top staff */}
      {s.topStaff && (
        <div className="card">
          <div className="muted" style={{ marginBottom: '12px' }}>Топ-мастер дня</div>
          <div className="top-staff-card">
            <div className="top-staff-avatar">{topInitial}</div>
            <div className="top-staff-info">
              <div className="top-staff-name">{s.topStaff.name}</div>
              <div className="top-staff-revenue">
                {tg(s.topStaff.revenue)} · {s.topStaff.visits} визит{
                  s.topStaff.visits === 1 ? '' : s.topStaff.visits < 5 ? 'а' : 'ов'
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
