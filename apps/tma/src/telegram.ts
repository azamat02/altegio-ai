type TG = {
  initData: string;
  colorScheme: 'light' | 'dark';
  platform?: string;
  version?: string;
  ready(): void;
  expand(): void;
};

const tg = (): TG | undefined => (window as any).Telegram?.WebApp;

const HASH_KEY = '__tma_init_data';

// Telegram launches Mini Apps with the auth payload in the URL fragment:
//   https://app/#tgWebAppData=<initData>&tgWebAppVersion=...
// telegram-web-app.js normally parses it into Telegram.WebApp.initData, but if
// that external script fails to load (or a client quirk leaves initData empty)
// we can read the source of truth ourselves. Persist to sessionStorage so an
// in-app reload (which may drop the hash) keeps working.
export function initDataFromHash(hash: string): string {
  const m = /[#&]tgWebAppData=([^&]*)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : '';
}

function fromHashOrSession(): string {
  const fresh = initDataFromHash(window.location.hash);
  if (fresh) {
    try {
      sessionStorage.setItem(HASH_KEY, fresh);
    } catch {
      /* private mode etc. — non-fatal */
    }
    return fresh;
  }
  try {
    return sessionStorage.getItem(HASH_KEY) ?? '';
  } catch {
    return '';
  }
}

export function shouldRequestFullscreen(platform: string | undefined, hasApi: boolean): boolean {
  return hasApi && (platform === 'ios' || platform === 'android');
}

export function initTelegram(): void {
  const t = tg();
  t?.ready();
  t?.expand();
  const anyT = t as any;
  if (!shouldRequestFullscreen(t?.platform, typeof anyT?.requestFullscreen === 'function')) return;
  try {
    anyT.requestFullscreen();
  } catch {
    return; // client refused — expanded mode is fine
  }
  const applySafeTop = () => {
    const top = (anyT?.safeAreaInset?.top ?? 0) + (anyT?.contentSafeAreaInset?.top ?? 0);
    document.documentElement.style.setProperty('--safe-top', `${top}px`);
  };
  for (const e of ['fullscreenChanged', 'safeAreaChanged', 'contentSafeAreaChanged']) {
    anyT?.onEvent?.(e, applySafeTop);
  }
  setTimeout(applySafeTop, 300);
}

export const getInitData = (): string => tg()?.initData || fromHashOrSession();
export const getTheme = (): 'light' | 'dark' => tg()?.colorScheme ?? 'light';

// Temporary diagnostics for the no-initData screen.
export function tgDebugInfo(): string {
  const t = tg();
  const script = t ? 'y' : 'n';
  const hash = initDataFromHash(window.location.hash) ? 'y' : 'n';
  return `tg:${script} hash:${hash} platform:${t?.platform ?? '?'} v:${t?.version ?? '?'}`;
}
