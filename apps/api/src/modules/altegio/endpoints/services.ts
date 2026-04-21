import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioServiceDto } from '../dto/service.dto';

@Injectable()
export class ServicesEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchAll(auth: AltegioAuthContext): Promise<AltegioServiceDto[]> {
    type Resp = { success: boolean; data: AltegioServiceDto[] };
    const res = await this.client.get<Resp>(auth, `/company/${auth.locationId}/services`);
    return res.data ?? [];
  }
}
