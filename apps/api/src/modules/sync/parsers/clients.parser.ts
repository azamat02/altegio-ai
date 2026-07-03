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
      lastVisitDate: this.normalizeDate(dto.last_visit_date),
      spent: dto.sold_amount ?? dto.spent ?? null,
    };
  }

  // Search endpoint sends "YYYY-MM-DD HH:MM:SS", "" when the client never visited,
  // and occasionally zero-dates. The clients column is a plain `date`.
  private normalizeDate(v: string | null | undefined): string | null {
    if (!v) return null;
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
    if (!m || m[1] === '0000-00-00') return null;
    return m[1];
  }
}
