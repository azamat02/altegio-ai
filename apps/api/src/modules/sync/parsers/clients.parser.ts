import { Injectable } from '@nestjs/common';
import { AltegioClientDto } from '../../altegio/dto/client.dto';

export interface ClientRow {
  tenantId: string;
  altegioClientId: number;
  name: string | null;
  phone: string | null;
  visitsCount: number | null;
  lastVisitDate: string | null;
  spent: number | null;
}

@Injectable()
export class ClientsParser {
  toRow(tenantId: string, dto: AltegioClientDto): ClientRow {
    return {
      tenantId,
      altegioClientId: dto.id,
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      visitsCount: dto.visits_count ?? null,
      lastVisitDate: dto.last_visit_date ?? null,
      spent: dto.spent ?? null,
    };
  }
}
