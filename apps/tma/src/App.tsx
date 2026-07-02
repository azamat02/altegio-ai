import { useEffect, useState } from 'react';
import './theme.css';
import type { TmaSummary } from '@altegio/shared';
import { initTelegram, getTheme, getInitData } from './telegram';
import { api } from './api';
import { Summary } from './screens/Summary';
import { Staff } from './screens/Staff';
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
    api.get<TmaSummary>('/tma/summary').then(setSummary).catch((e: Error) => setError(e.message));
  }, []);

  if (error === 'NO_INITDATA') {
    return (
      <div className="app">
        <div className="state-screen">
          <p className="muted">
            Этот клиент Telegram не передал данные авторизации.
            Откройте дашборд через Telegram на телефоне (iOS/Android).
          </p>
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
    </div>
  );
}
