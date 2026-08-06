import { safeStorage } from 'electron';
import type { ApiKeySettings } from '../../renderer/src/types/settings';
import { logger } from '../../shared/logger';

const PREFIX = 'onda-enc:v1:';

export function encryptSecret(plain: string): string {
  if (plain.startsWith(PREFIX)) return plain;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return PREFIX + safeStorage.encryptString(plain).toString('base64');
    }
  } catch (e) {
    logger.warn('settings', 'safeStorage encrypt failed, storing plaintext', e);
  }
  return plain;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'));
  } catch (e) {
    logger.warn('settings', 'safeStorage decrypt failed, returning raw value', e);
    return stored;
  }
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
