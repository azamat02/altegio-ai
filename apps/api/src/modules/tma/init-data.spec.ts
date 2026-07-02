// apps/api/src/modules/tma/init-data.spec.ts
import * as crypto from 'crypto';
import { validateInitData } from './init-data';

const BOT_TOKEN = '123:ABC';

function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

describe('validateInitData', () => {
  const now = Math.floor(Date.now() / 1000);

  it('accepts a correctly signed payload and returns the user id', () => {
    const initData = sign({ auth_date: String(now), user: JSON.stringify({ id: 555 }) });
    expect(validateInitData(initData, BOT_TOKEN, 86400)).toEqual({ userId: 555 });
  });

  it('rejects a tampered hash', () => {
    const initData = sign({ auth_date: String(now), user: JSON.stringify({ id: 555 }) }) + '00';
    expect(validateInitData(initData, BOT_TOKEN, 86400)).toBeNull();
  });

  it('rejects a payload signed with a different token', () => {
    const initData = sign({ auth_date: String(now), user: JSON.stringify({ id: 555 }) }, '999:XYZ');
    expect(validateInitData(initData, BOT_TOKEN, 86400)).toBeNull();
  });

  it('rejects an expired auth_date', () => {
    const initData = sign({ auth_date: String(now - 100000), user: JSON.stringify({ id: 555 }) });
    expect(validateInitData(initData, BOT_TOKEN, 86400)).toBeNull();
  });
});
