import { getInitData } from './telegram';

const BASE = import.meta.env.VITE_API_URL ?? '';

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `tma ${getInitData()}` },
    });
    if (res.status === 403) throw new Error('NO_SALON');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  },
};
