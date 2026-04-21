import { Injectable } from '@nestjs/common';
import { AltegioRecordDto } from '../../altegio/dto/record.dto';

export interface RecordRow {
  tenantId: string;
  altegioRecordId: number;
  altegioStaffId: number | null;
  altegioClientId: number | null;
  altegioServiceId: number | null;
  datetime: Date;
  seanceLength: number | null;
  cost: number;
  attendance: number;
  paidFull: number;
  isOnline: boolean;
  deleted: boolean;
  resourceInstanceIds: number[];
}

function computeCost(dto: AltegioRecordDto): number {
  if (dto.cost && Number(dto.cost) > 0) return Number(dto.cost);
  return (dto.services ?? []).reduce((sum, s) => {
    const unit = Number(s.cost ?? s.cost_to_pay ?? 0);
    const amount = Number(s.amount ?? 1);
    return sum + unit * amount;
  }, 0);
}

@Injectable()
export class RecordsParser {
  toRecordRow(tenantId: string, dto: AltegioRecordDto): RecordRow {
    return {
      tenantId,
      altegioRecordId: dto.id,
      altegioStaffId: dto.staff_id ?? null,
      altegioClientId: dto.client?.id ?? null,
      altegioServiceId: dto.services?.[0]?.id ?? null,
      datetime: new Date(dto.datetime),
      seanceLength: Number(dto.length ?? dto.seance_length ?? 0) || null,
      resourceInstanceIds: Array.isArray(dto.resource_instance_ids) ? dto.resource_instance_ids : [],
      cost: computeCost(dto),
      attendance: dto.attendance ?? 0,
      paidFull: dto.paid_full ?? 0,
      isOnline: Boolean(dto.online),
      deleted: Boolean(dto.deleted),
    };
  }
}
