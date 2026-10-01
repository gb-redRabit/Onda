import { safeStorage } from 'electron';
import type { ApiKeySettings, SecretStorageStatus } from '../../shared/types/settings';
import { logger } from '../../shared/logger';
import { recordWarning } from '../warnings';

const PREFIX = 'onda-enc:v1:';
const PLAIN_PREFIX = 'onda-plain:v1:';

/**
 * `weak` is not a theoretical concern: on Linux, when no OS keyring can be
 * found, Electron falls back to the `basic_text` backend, which reports
 * encryption as *available* while actually deriving its key from a constant
 * baked into the library. Anything written then is obfuscated, not protected —
 * and `isEncryptionAvailable()` alone cannot tell the two cases apart.
 */
export type { SecretStorageStatus };

const REAL_KEYRINGS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);

let cached: SecretStorageStatus | null = null;

/**
 * Thrown instead of writing a secret to disk unprotected. Callers surface this
 * to the user; a secret that cannot be encrypted is not stored at all.
 */
export class SecretStorageUnavailableError extends Error {
  constructor() {
    super('System key storage is unavailable, so the secret was not saved');
    this.name = 'SecretStorageUnavailableError';
  }
}

export function encryptionStatus(): SecretStorageStatus {
  if (cached) return cached;
  cached = resolveStatus();
  return cached;
}

/** Test seam: the platform cannot change inside one process. */
export function __resetEncryptionStatusCache(): void {
  cached = null;
}

function resolveStatus(): SecretStorageStatus {
  let available = false;
  try {
    available = safeStorage.isEncryptionAvailable();
  } catch (e) {
    logger.warn('settings', 'safeStorage.isEncryptionAvailable threw', e);
    return 'unavailable';
  }
  if (!available) return 'unavailable';

  // Only Linux has selectable backends; on Windows and macOS the OS keychain is
  // always what is used, and getSelectedStorageBackend throws there.
  if (process.platform !== 'linux') return 'strong';

  let backend: string;
  try {
    backend = safeStorage.getSelectedStorageBackend();
  } catch (e) {
    logger.warn('settings', 'getSelectedStorageBackend threw', e);
    return 'unavailable';
  }
  return REAL_KEYRINGS.has(backend) ? 'strong' : 'weak';
}

function warnOnce(text: string): void {
  logger.warn('settings', text);
  // Surfaces in Settings > Diagnostics, so the user can see that the key is not
  // actually protected rather than having to find it in a log file.
  recordWarning(text);
}

export function encryptSecret(plain: string): string {
  if (plain.startsWith(PREFIX)) return plain;

  const status = encryptionStatus();
  if (status === 'unavailable') {
    // Storing the value as marked plaintext would put the key in the settings
    // file in the clear. Refusing is the only way the user learns their key is
    // not being protected, instead of finding out after trusting the app.
    warnOnce(
      'System key storage is unavailable, so API keys are not being saved. ' +
        'Set a keyring (GNOME Keyring or KWallet) and restart Onda.'
    );
    throw new SecretStorageUnavailableError();
  }
  if (status === 'weak') {
    warnOnce(
      'No OS keyring was found, so API keys are obfuscated but not encrypted. ' +
        'Install GNOME Keyring or KWallet to protect them.'
    );
  }

  try {
    return PREFIX + safeStorage.encryptString(plain).toString('base64');
  } catch (e) {
    // An encryption that throws is not recoverable by writing the value out.
    logger.warn('settings', 'safeStorage.encryptString failed', e);
    warnOnce('Encrypting the API key failed, so it was not saved.');
    throw new SecretStorageUnavailableError();
  }
}

export function decryptSecret(stored: string): string {
  if (stored.startsWith(PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'));
    } catch (e) {
      // A value written by a different OS keychain, or after the keyring was
      // reset, cannot be read. Returning the ciphertext keeps the user from
      // silently overwriting a key they cannot see, and encryptSecret() passes
      // already-prefixed values through untouched.
      logger.warn('settings', 'safeStorage decrypt failed, keeping stored value', e);
      return stored;
    }
  }
  // Values written by older builds that fell back to plaintext are still read,
  // so upgrading does not lose a configured key.
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length);
  return stored;
}

export function encryptApiKeys(apiKeys: ApiKeySettings | undefined): ApiKeySettings | undefined {
  if (!apiKeys) return apiKeys;
  return {
    keys: (apiKeys.keys || []).map((k) => ({ ...k, key: encryptSecret(k.key) }))
  };
}

export function decryptApiKeys(apiKeys: ApiKeySettings | undefined): ApiKeySettings | undefined {
  if (!apiKeys) return apiKeys;
  return {
    keys: (apiKeys.keys || []).map((k) => ({ ...k, key: decryptSecret(k.key) }))
  };
}
