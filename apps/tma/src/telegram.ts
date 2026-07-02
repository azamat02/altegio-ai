type TG = { initData: string; colorScheme: 'light' | 'dark'; ready(): void; expand(): void };

const tg = (): TG | undefined => (window as any).Telegram?.WebApp;

export function initTelegram(): void {
  const t = tg();
  t?.ready();
  t?.expand();
}

export const getInitData = (): string => tg()?.initData ?? '';
export const getTheme = (): 'light' | 'dark' => tg()?.colorScheme ?? 'light';
