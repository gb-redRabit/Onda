import { safeStorage } from 'electron';
import type { ApiKeySettings, SecretStorageStatus } from '../../../shared/types/settings';
import { logger } from '../../../shared/logger';
import { recordWarning } from '../../warnings';

const PREFIX = 'onda-enc:v1:';
const PLAIN_PREFIX = 'onda-plain:v1:';

/**
 * `weak` to nie teoretyczne zmartwienie: w Linuxie, gdy nie można znaleźć
 * keyringu systemowego, Electron spada do backendu `basic_text`, który raportuje
 * szyfrowanie jako *dostępne*, podczas gdy faktycznie wyprowadza klucz ze stałej
 * wkompilowanej w bibliotekę. Wszystko, co wtedy zapisano, jest zaciemnione, a nie chronione —
 * a samo `isEncryptionAvailable()` nie odróżnia tych dwóch przypadków.
 */
export type { SecretStorageStatus };

const REAL_KEYRINGS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);

let cached: SecretStorageStatus | null = null;

/**
 * Rzucane zamiast zapisania sekretu na dysk bez ochrony. Wywołujący pokazują to
 * użytkownikowi; sekret, którego nie można zaszyfrować, nie jest w ogóle zapisywany.
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

/** Szew testowy: platforma nie może się zmienić w obrębie jednego procesu. */
export function __resetEncryptionStatusCache(): void {
  cached = null;
}

function resolveStatus(): SecretStorageStatus {
  let available: boolean;
  try {
    available = safeStorage.isEncryptionAvailable();
  } catch (e) {
    logger.warn('settings', 'safeStorage.isEncryptionAvailable threw', e);
    return 'unavailable';
  }
  if (!available) return 'unavailable';

  // Tylko Linux ma wybieralne backendy; w Windows i macOS zawsze używany jest
  // keychain systemowy, a getSelectedStorageBackend rzuca tam wyjątek.
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
  // Pokazuje się w Ustawienia > Diagnostyka, więc użytkownik może zobaczyć, że klucz nie
  // jest faktycznie chroniony, zamiast musieć szukać tego w pliku logu.
  recordWarning(text);
}

export function encryptSecret(plain: string): string {
  if (plain.startsWith(PREFIX)) return plain;

  const status = encryptionStatus();
  if (status === 'unavailable') {
    // Zapisanie wartości jako oznaczonego plaintextu umieściłoby klucz w pliku
    // ustawień jawnie. Odmowa to jedyny sposób, by użytkownik dowiedział się, że jego klucz
    // nie jest chroniony, zamiast odkryć to po zaufaniu aplikacji.
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
    // Szyfrowania, które rzuca wyjątek, nie da się naprawić przez zapisanie wartości.
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
      // Wartości zapisanej przez inny keychain systemowy lub po zresetowaniu keyringu
      // nie da się odczytać. Zwrócenie szyfrogramu powstrzymuje użytkownika przed
      // cichym nadpisaniem klucza, którego nie widzi, a encryptSecret() przepuszcza
      // już oprefiksowane wartości nietknięte.
      logger.warn('settings', 'safeStorage decrypt failed, keeping stored value', e);
      return stored;
    }
  }
  // Wartości zapisane przez starsze buildy, które spadały do plaintextu, są nadal czytane,
  // więc aktualizacja nie gubi skonfigurowanego klucza.
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

/**
 * Wersja kluczy dla renderera: sekret NIGDY nie opuszcza procesu main. Zamiast
 * wartości zwracamy tylko `preview` (pierwsze znaki) do celów UI; pole `key`
 * jest puste, więc kompromitacja renderera nie daje surowych sekretów.
 */
export function maskApiKeys(apiKeys: ApiKeySettings | undefined): ApiKeySettings | undefined {
  if (!apiKeys) return apiKeys;
  return {
    keys: (apiKeys.keys || []).map((k) => {
      const plain = decryptSecret(k.key);
      return {
        ...k,
        key: '',
        preview: plain ? `${plain.slice(0, 4)}…` : ''
      };
    })
  };
}

/**
 * Scala klucze przychodzące z renderera z zapisanymi: wpis z pustym `key`
 * (użytkownik nie zmieniał wartości) zachowuje zapisany sekret po `id`, nowy
 * wpis dostaje podaną wartość. Bez tego zapis z UI nadpisałby sekret pustym
 * stringiem (bo renderer już go nie zna).
 */
export function mergeApiKeys(
  incoming: ApiKeySettings | undefined,
  stored: ApiKeySettings | undefined
): ApiKeySettings | undefined {
  if (!incoming) return incoming;
  const storedById = new Map((stored?.keys || []).map((k) => [k.id, k]));
  return {
    keys: (incoming.keys || []).map((k) => {
      const { preview: _preview, ...rest } = k;
      if (k.key) return { ...rest, key: k.key };
      const existing = storedById.get(k.id);
      return { ...rest, key: existing?.key ?? '' };
    })
  };
}
