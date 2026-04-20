import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import type { AltegioAuthContext } from '../types';
import type { AltegioRecordDto } from '../dto/record.dto';

export interface FetchRecordsParams {
  start: string;
  end: string;
  page?: number;
  count?: number;
}

@Injectable()
export class RecordsEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchPage(auth: AltegioAuthContext, params: FetchRecordsParams): Promise<AltegioRecordDto[]> {
    type Resp = { success: boolean; data: AltegioRecordDto[] };
    const res = await this.client.get<Resp>(auth, `/records/${auth.locationId}`, {
      start_date: params.start,
      end_date: params.end,
      page: params.page ?? 1,
      count: params.count ?? 200,
    });
    return res.data;
  }

  async *fetchAll(
    auth: AltegioAuthContext,
    params: Omit<FetchRecordsParams, 'page'>,
  ): AsyncGenerator<AltegioRecordDto[]> {
    let page = 1;
    while (true) {
      const batch = await this.fetchPage(auth, { ...params, page });
      if (batch.length === 0) return;
      yield batch;
      if (batch.length < (params.count ?? 200)) return;
      page++;
    }
  }
}
