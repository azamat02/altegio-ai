import { useEffect, useState } from 'react';
import './theme.css';
import type { TmaSummary } from '@altegio/shared';
import { initTelegram, getTheme, getInitData, tgDebugInfo } from './telegram';
import { api } from './api';
import { Summary } from './screens/Summary';
import { Staff } from './screens/Staff';
import { Losses } from './screens/Losses';
import { Clients } from './screens/Clients';
import { TabBar, type TabId } from './components/TabBar';

export default function App() {
  const [summary, setSummary] = useState<TmaSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('summary');

  useEffect(() => {
    initTelegram();
    document.documentElement.setAttribute('data-theme', getTheme());
    // Some Telegram clients (notably the native macOS app) do not pass initData
    // to Mini Apps — fail fast with a precise message instead of a doomed 401.
    if (!getInitData()) {
      setError('NO_INITDATA');
      return;
    }
    let stale = false;
    api.get<TmaSummary>('/tma/summary')
      .then((s) => { if (!stale) setSummary(s); })
      .catch((e: Error) => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, []);

  if (error === 'NO_INITDATA') {
    return (
      <div className="app">
        <div className="state-screen">
          <p className="muted">
            Telegram не передал данные авторизации.
            Откройте дашборд через кнопку «Дашборд» рядом с полем ввода
            или кнопку под отчётом.
          </p>
          <p className="muted" style={{ fontSize: 11, opacity: 0.6 }}>{tgDebugInfo()}</p>
        </div>
      </div>
    );
  }

  if (error === 'NO_SALON') {
    return (
      <div className="app">
        <div className="state-screen">
          <p className="muted">Откройте дашборд из бота вашего салона.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="state-screen">
          <p className="muted">Ошибка загрузки. Попробуйте позже.</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="app">
        <div className="state-screen">
          <div className="spinner" />
          <p className="muted">Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TabBar active={tab} onChange={setTab} />
      {tab === 'summary' && <Summary summary={summary} />}
      {tab === 'staff' && <Staff />}
      {tab === 'losses' && <Losses />}
      {tab === 'clients' && <Clients />}
    </div>
  );
}
