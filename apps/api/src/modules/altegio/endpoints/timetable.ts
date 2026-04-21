import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioStaffScheduleDto } from '../dto/timetable.dto';

@Injectable()
export class TimetableEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchStaffSchedule(
    auth: AltegioAuthContext,
    start: string,
    end: string,
  ): Promise<AltegioStaffScheduleDto[]> {
    type Resp = { success: boolean; data: AltegioStaffScheduleDto[] };
    const res = await this.client.get<Resp>(
      auth,
      `/company/${auth.locationId}/staff/schedule`,
      { start_date: start, end_date: end },
    );
    return res.data;
  }
}
