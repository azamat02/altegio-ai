import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioResourceDto } from '../dto/resource.dto';

@Injectable()
export class ResourcesEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchAll(auth: AltegioAuthContext): Promise<AltegioResourceDto[]> {
    type Resp = { success: boolean; data: AltegioResourceDto[] };
    const res = await this.client.get<Resp>(auth, `/resources/${auth.locationId}`);
    return res.data;
  }
}
