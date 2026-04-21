import { Injectable } from '@nestjs/common';
import { AltegioServiceDto } from '../../altegio/dto/service.dto';

export interface ServiceRow {
  tenantId: string;
  altegioServiceId: number;
  title: string;
  categoryId: number | null;
  priceMin: number | null;
  priceMax: number | null;
  active: boolean;
}

@Injectable()
export class ServicesParser {
  toRow(tenantId: string, dto: AltegioServiceDto): ServiceRow {
    return {
      tenantId,
      altegioServiceId: dto.id,
      title: dto.title,
      categoryId: dto.category_id ?? null,
      priceMin: dto.price_min ?? null,
      priceMax: dto.price_max ?? null,
      active: Boolean(dto.active ?? 1),
    };
  }
}
