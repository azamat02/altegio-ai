import sample from '../../../../test/fixtures/altegio/timetable-sample.json';
import { parseTimetable } from './timetable.parser';
import { AltegioResourceTimetableDto } from '../../altegio/dto/timetable.dto';

describe('parseTimetable', () => {
  it('sums slot minutes per date; zero when not working', () => {
    const rows = parseTimetable('tenant-a', 135733, sample as AltegioResourceTimetableDto[]);
    const byDate = Object.fromEntries(rows.map(r => [r.date, r.workingMinutes]));
    expect(byDate['2026-04-19']).toBe(600);
    expect(byDate['2026-04-20']).toBe(480);
    expect(byDate['2026-04-21']).toBe(0);
  });

  it('attaches tenantId and resourceAltegioId to every row', () => {
    const rows = parseTimetable('t', 42, sample as AltegioResourceTimetableDto[]);
    for (const r of rows) {
      expect(r.tenantId).toBe('t');
      expect(r.resourceAltegioId).toBe(42);
    }
  });
});
