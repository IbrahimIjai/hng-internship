import { randomBytes } from 'node:crypto';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createUuidV7(date = new Date()): string {
  const unixMillis = BigInt(date.getTime());
  const timeHex = unixMillis.toString(16).padStart(12, '0');
  const random = randomBytes(10);

  const bytes = new Uint8Array(16);

  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number.parseInt(timeHex.slice(index * 2, index * 2 + 2), 16);
  }

  bytes[6] = 0x70 | (random[0] & 0x0f);
  bytes[7] = random[1];
  bytes[8] = 0x80 | (random[2] & 0x3f);
  bytes[9] = random[3];
  bytes[10] = random[4];
  bytes[11] = random[5];
  bytes[12] = random[6];
  bytes[13] = random[7];
  bytes[14] = random[8];
  bytes[15] = random[9];

  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUuidV7(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
