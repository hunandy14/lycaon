import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * 房主管理密碼：scrypt 雜湊，格式 `salt:derivedHex`。純 node:crypto，無外部依賴。
 * 用途是「擋一下」隨手亂點的觀戰者，非高強度秘密系統——搭配 CF Access 為第二道鎖。
 */

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 32);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
