import { TokenCipher } from './token-cipher.service';

describe('TokenCipher', () => {
  const key = 'a'.repeat(64); // 32 bytes hex
  const cipher = new TokenCipher(key);

  it('round-trips a token', () => {
    const plain = '3nhhg28zsrc6wx84e8xk';
    const encrypted = cipher.encrypt(plain);
    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.length).toBeGreaterThan(plain.length);
    expect(cipher.decrypt(encrypted)).toBe(plain);
  });

  it('produces different ciphertext per call (nonce)', () => {
    const a = cipher.encrypt('same');
    const b = cipher.encrypt('same');
    expect(a.equals(b)).toBe(false);
  });

  it('rejects key that is not 32-byte hex', () => {
    expect(() => new TokenCipher('short')).toThrow(/32 bytes/);
  });

  it('fails to decrypt with a wrong key', () => {
    const other = new TokenCipher('b'.repeat(64));
    const payload = cipher.encrypt('secret');
    expect(() => other.decrypt(payload)).toThrow();
  });
});
