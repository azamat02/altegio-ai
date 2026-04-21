import { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import Bottleneck from 'bottleneck';
import { AltegioAuthContext } from './types';

export function buildAuthHeader(auth: AltegioAuthContext): string {
  let v = `Bearer ${auth.partnerToken}`;
  if (auth.userToken) v += `, User ${auth.userToken}`;
  return v;
}

export interface AltegioClientOptions {
  baseUrl: string;
  requestsPerSecond?: number;
  retries?: number;
}

export class AltegioClient {
  private readonly http: AxiosInstance;
  private readonly limiter: Bottleneck;

  constructor(opts: AltegioClientOptions) {
    this.http = axios.create({
      baseURL: opts.baseUrl,
      timeout: 30_000,
      headers: { Accept: 'application/vnd.api.v2+json' },
    });
    axiosRetry(this.http, {
      retries: opts.retries ?? 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (err) => {
        const status = err.response?.status;
        if (!status) return true; // network
        return status >= 500 || status === 429;
      },
    });
    this.limiter = new Bottleneck({
      reservoir: opts.requestsPerSecond ?? 3,
      reservoirRefreshAmount: opts.requestsPerSecond ?? 3,
      reservoirRefreshInterval: 1000,
      maxConcurrent: 5,
    });
  }

  async get<T>(
    auth: AltegioAuthContext,
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const cfg: AxiosRequestConfig = {
      url: path,
      method: 'GET',
      params,
      headers: { Authorization: buildAuthHeader(auth) },
    };
    const res = await this.limiter.schedule(() => this.http.request<T>(cfg));
    return res.data;
  }
}
