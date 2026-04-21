import sample from '../../../../test/fixtures/altegio/timetable-sample.json';
import { parseStaffSchedule } from './timetable.parser';
import { AltegioStaffScheduleDto } from '../../altegio/dto/timetable.dto';

describe('parseStaffSchedule', () => {
  it('sums slot minutes per staff+date; zero when slots is empty', () => {
    const rows = parseStaffSchedule('tenant-a', sample as AltegioStaffScheduleDto[]);
    // staff 2663815: 19th = 10h (600 min), 20th = 4h+4h (480 min), 21st = 0
    const byStaffDate = Object.fromEntries(
      rows.map(r => [`${r.resourceAltegioId}:${r.date}`, r.workingMinutes]),
    );
    expect(byStaffDate['2663815:2026-04-19']).toBe(600);
    expect(byStaffDate['2663815:2026-04-20']).toBe(480);
    expect(byStaffDate['2663815:2026-04-21']).toBe(0);
    expect(byStaffDate['2798427:2026-04-19']).toBe(480);
  });

  it('attaches tenantId and uses staff_id as resourceAltegioId on every row', () => {
    const rows = parseStaffSchedule('t', sample as AltegioStaffScheduleDto[]);
    for (const r of rows) {
      expect(r.tenantId).toBe('t');
      expect(typeof r.resourceAltegioId).toBe('number');
    }
  });

  it('produces one row per dto entry', () => {
    const rows = parseStaffSchedule('tenant-a', sample as AltegioStaffScheduleDto[]);
    expect(rows).toHaveLength(sample.length);
  });
});
