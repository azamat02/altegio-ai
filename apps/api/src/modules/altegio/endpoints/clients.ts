import { Injectable } from '@nestjs/common';
import type { AltegioClient } from '../altegio.client';
import type { AltegioAuthContext } from '../types';
import type { AltegioClientDto } from '../dto/client.dto';

@Injectable()
export class ClientsEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchPage(auth: AltegioAuthContext, page = 1, count = 200): Promise<AltegioClientDto[]> {
    type Resp = { success: boolean; data: AltegioClientDto[] };
    const res = await this.client.get<Resp>(auth, `/clients/${auth.locationId}`, { page, count });
    return res.data ?? [];
  }

  async *fetchAll(auth: AltegioAuthContext): AsyncGenerator<AltegioClientDto[]> {
    let page = 1;
    while (true) {
      const batch = await this.fetchPage(auth, page);
      if (batch.length === 0) return;
      yield batch;
      if (batch.length < 200) return;
      page++;
    }
  }
}
