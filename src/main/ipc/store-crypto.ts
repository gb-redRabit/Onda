import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { app } from 'electron';

const IV_LENGTH = 16;
const PBKDF2_ITERATIONS = 10000;

// Starszy klucz używany przez wcześniejsze buildy: sha256('onda-settings-' + hostname).
export function legacyStoreKey(): string {
  const host = os.hostname();
  return createHash('sha256').update(`onda-settings-${host}`).digest('hex').slice(0, 32);
}

function derivePassword(key: string, iv: Buffer): Buffer {
  return pbkdf2Sync(key, iv, PBKDF2_ITERATIONS, 32, 'sha512');
}

// Odzwierciedla format szyfrowania conf (aes-256-cbc): iv ':' ciphertext.
export function decryptConf(data: Buffer, key: string): string | null {
  try {
    const iv = data.subarray(0, IV_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + 1);
    const decipher = createDecipheriv('aes-256-cbc', derivePassword(key, iv), iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function encryptConf(plain: string, key: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-cbc', derivePassword(key, iv), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  return Buffer.concat([iv, Buffer.from(':'), encrypted]);
}

// Jeśli istnieje starszy store kluczowany nazwą hosta, zaszyfruj go ponownie świeżym losowym
// kluczem, aby istniejące dane użytkownika przetrwały zmianę klucza. Zwraca nowy klucz.
export async function migrateLegacyStore(keyPath: string): Promise<string | null> {
  const configPath = join(app.getPath('userData'), 'config.json');
  let raw: Buffer;
  try {
    raw = await readFile(configPath);
  } catch {
    return null;
  }
  // Pusty plik lub jawny JSON ('{') — nie ma czego migrować.
  if (raw.length === 0 || raw[0] === 0x7b) return null;
  if (raw.length < IV_LENGTH + 1 || raw[IV_LENGTH] !== ':'.charCodeAt(0)) return null;
  const plain = decryptConf(raw, legacyStoreKey());
  if (plain === null) return null;
  const fresh = randomBytes(32).toString('hex');
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(keyPath, fresh, { mode: 0o600 });
  await writeFile(configPath, encryptConf(plain, fresh));
  return fresh;
}
