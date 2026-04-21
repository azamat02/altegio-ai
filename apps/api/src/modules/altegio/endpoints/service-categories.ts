import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioServiceCategoryDto } from '../dto/service-category.dto';

@Injectable()
export class ServiceCategoriesEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchAll(auth: AltegioAuthContext): Promise<AltegioServiceCategoryDto[]> {
    type Resp = { success: boolean; data: AltegioServiceCategoryDto[] };
    const res = await this.client.get<Resp>(auth, `/service_categories/${auth.locationId}`);
    return res.data ?? [];
  }
}
