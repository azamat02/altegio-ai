import { Injectable } from '@nestjs/common';
import type { AltegioRecordDto } from '../../altegio/dto/record.dto';

export interface RecordRow {
  tenantId: string;
  altegioRecordId: number;
  altegioStaffId: number | null;
  altegioClientId: number | null;
  datetime: Date;
  seanceLength: number | null;
  cost: number;
  attendance: number;
  paidFull: number;
  isOnline: boolean;
  deleted: boolean;
}

@Injectable()
export class RecordsParser {
  toRecordRow(tenantId: string, dto: AltegioRecordDto): RecordRow {
    return {
      tenantId,
      altegioRecordId: dto.id,
      altegioStaffId: dto.staff_id ?? null,
      altegioClientId: dto.client?.id ?? null,
      datetime: new Date(dto.datetime),
      seanceLength: dto.seance_length ?? null,
      cost: Number(dto.cost ?? 0),
      attendance: dto.attendance ?? 0,
      paidFull: dto.paid_full ?? 0,
      isOnline: Boolean(dto.online),
      deleted: Boolean(dto.deleted),
    };
  }
}
