import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import type { AltegioAuthContext } from '../types';
import type { AltegioStaffDto } from '../dto/staff.dto';

@Injectable()
export class StaffEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchAll(auth: AltegioAuthContext): Promise<AltegioStaffDto[]> {
    type Resp = { success: boolean; data: AltegioStaffDto[] };
    const res = await this.client.get<Resp>(auth, `/staff/${auth.locationId}`);
    return res.data ?? [];
  }
}
