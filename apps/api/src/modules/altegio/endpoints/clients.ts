import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioClientDto } from '../dto/client.dto';

// Fields the search endpoint returns on request. NB: the money field is
// `sold_amount` — `spent`/`paid`/`balance` are silently ignored by this endpoint.
const SEARCH_FIELDS = ['id', 'name', 'phone', 'email', 'visits_count', 'last_visit_date', 'sold_amount'];

const PAGE_SIZE = 200;

@Injectable()
export class ClientsEndpoint {
  constructor(private readonly client: AltegioClient) {}

  /** @deprecated list endpoint returns no visit fields; removed once sync switches to fetchAll */
  async fetchPage(auth: AltegioAuthContext, page = 1, count = 200): Promise<AltegioClientDto[]> {
    type Resp = { success: boolean; data: AltegioClientDto[] };
    const res = await this.client.get<Resp>(auth, `/clients/${auth.locationId}`, { page, count });
    return res.data ?? [];
  }

  async searchPage(
    auth: AltegioAuthContext,
    page = 1,
    pageSize = PAGE_SIZE,
  ): Promise<{ clients: AltegioClientDto[]; totalCount: number }> {
    type Resp = { success: boolean; data: AltegioClientDto[]; meta?: { total_count?: number } };
    const res = await this.client.post<Resp>(auth, `/company/${auth.locationId}/clients/search`, {
      page,
      page_size: pageSize,
      fields: SEARCH_FIELDS,
    });
    return { clients: res.data ?? [], totalCount: res.meta?.total_count ?? 0 };
  }

  async *fetchAll(auth: AltegioAuthContext): AsyncGenerator<AltegioClientDto[]> {
    let page = 1;
    while (true) {
      const { clients } = await this.searchPage(auth, page);
      if (clients.length === 0) return;
      yield clients;
      if (clients.length < PAGE_SIZE) return;
      page++;
    }
  }
}
