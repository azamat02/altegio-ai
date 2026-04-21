import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioResourceTimetableDto } from '../dto/timetable.dto';

@Injectable()
export class TimetableEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchResourceRange(
    auth: AltegioAuthContext,
    resourceId: number,
    start: string,
    end: string,
  ): Promise<AltegioResourceTimetableDto[]> {
    type Resp = { success: boolean; data: AltegioResourceTimetableDto[] };
    const res = await this.client.get<Resp>(
      auth,
      `/timetable/resources/${auth.locationId}/${resourceId}`,
      { start_date: start, end_date: end },
    );
    return res.data;
  }
}
