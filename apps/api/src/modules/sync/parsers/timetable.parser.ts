import { AltegioResourceTimetableDto } from '../../altegio/dto/timetable.dto';

export interface ResourceScheduleRow {
  tenantId: string;
  resourceAltegioId: number;
  date: string;
  workingMinutes: number;
}

export function parseTimetable(
  tenantId: string,
  resourceAltegioId: number,
  dtos: AltegioResourceTimetableDto[],
): ResourceScheduleRow[] {
  return dtos.map(d => ({
    tenantId,
    resourceAltegioId,
    date: d.date,
    workingMinutes: !d.is_working ? 0 : d.slots.reduce((acc, s) => acc + diffMinutes(s.from, s.to), 0),
  }));
}

function diffMinutes(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return th * 60 + tm - (fh * 60 + fm);
}
