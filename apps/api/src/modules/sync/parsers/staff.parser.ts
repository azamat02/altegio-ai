import { Injectable } from '@nestjs/common';
import { AltegioStaffDto } from '../../altegio/dto/staff.dto';

export interface StaffRow {
  tenantId: string;
  altegioStaffId: number;
  name: string;
  specialization: string | null;
  positionTitle: string | null;
  fired: boolean;
  bookable: boolean;
}

@Injectable()
export class StaffParser {
  toRow(tenantId: string, dto: AltegioStaffDto): StaffRow {
    return {
      tenantId,
      altegioStaffId: dto.id,
      name: dto.name,
      specialization: dto.specialization ?? null,
      positionTitle: dto.position?.title ?? null,
      fired: Boolean(dto.fired),
      bookable: dto.bookable ?? true,
    };
  }
}
