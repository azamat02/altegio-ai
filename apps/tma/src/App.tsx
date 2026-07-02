import { useEffect, useState } from 'react';
import './theme.css';
import type { TmaSummary } from '@altegio/shared';
import { initTelegram, getTheme } from './telegram';
import { api } from './api';
import { Summary } from './screens/Summary';

export default function App() {
  const [summary, setSummary] = useState<TmaSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    document.documentElement.setAttribute('data-theme', getTheme());
    api.get<TmaSummary>('/tma/summary').then(setSummary).catch((e: Error) => setError(e.message));
  }, []);

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
      <Summary summary={summary} />
    </div>
  );
}
