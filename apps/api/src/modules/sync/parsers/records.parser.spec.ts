import { RecordsParser } from './records.parser';
import type { AltegioRecordDto } from '../../altegio/dto/record.dto';

describe('RecordsParser', () => {
  const parser = new RecordsParser();
  const tenantId = 't-1';

  it('maps basic fields including attendance and cost', () => {
    const dto: AltegioRecordDto = {
      id: 42,
      date: '2026-04-19 14:00:00',
      datetime: '2026-04-19T14:00:00+05:00',
      staff_id: 7,
      client: { id: 11 },
      services: [{ id: 1, title: 's', cost: 5000 }],
      cost: 5000,
      attendance: 1,
      paid_full: 1,
      online: true,
      seance_length: 3600,
      deleted: false,
    };
    const row = parser.toRecordRow(tenantId, dto);
    expect(row).toMatchObject({
      tenantId: 't-1',
      altegioRecordId: 42,
      altegioStaffId: 7,
      altegioClientId: 11,
      cost: 5000,
      attendance: 1,
      paidFull: 1,
      isOnline: true,
      seanceLength: 3600,
      deleted: false,
    });
    expect(row.datetime).toBeInstanceOf(Date);
  });

  it('preserves deleted=true', () => {
    const dto = { id: 1, date: '2026-04-01', datetime: '2026-04-01T10:00:00Z', staff_id: 1, services: [], cost: 0, attendance: 0, paid_full: 0, online: false, seance_length: 0, deleted: true } as AltegioRecordDto;
    expect(parser.toRecordRow('t', dto).deleted).toBe(true);
  });

  it('handles null client gracefully', () => {
    const dto = { id: 2, date: '2026-04-01', datetime: '2026-04-01T10:00:00Z', staff_id: 3, client: null, services: [], cost: 0, attendance: 0, paid_full: 0, online: false, seance_length: 0, deleted: false } as AltegioRecordDto;
    expect(parser.toRecordRow('t', dto).altegioClientId).toBeNull();
  });
});
