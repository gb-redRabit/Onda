import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { hostname } from 'os';

// Reimplements the legacy on-disk format so a test can seed a pre-migration
// profile: sha256('onda-settings-' + hostname) + conf's aes-256-cbc container
// (`iv(16) ':' ciphertext`). Mirrors src/main/ipc/store-crypto.ts.

const IV_LENGTH = 16;
const PBKDF2_ITERATIONS = 10000;

export function legacyStoreKey(): string {
  return createHash('sha256').update(`onda-settings-${hostname()}`).digest('hex').slice(0, 32);
}

export function encryptLegacyConfig(plain: string, key: string): Buffer {
  let iv = randomBytes(IV_LENGTH);
  // migrateLegacyStore treats a leading '{' as plaintext; avoid that 1-in-256 case.
  while (iv[0] === 0x7b) iv = randomBytes(IV_LENGTH);
  const password = pbkdf2Sync(key, iv, PBKDF2_ITERATIONS, 32, 'sha512');
  const cipher = createCipheriv('aes-256-cbc', password, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  return Buffer.concat([iv, Buffer.from(':'), encrypted]);
}
