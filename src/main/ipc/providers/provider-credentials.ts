// Poświadczenia providerów wymagających logowania (np. cookie dla 115/Quark/Google Drive).
// Trzymane w electron-store pod kluczem `providerCredentials`:
//   { [providerId]: { cookie: <encrypted> } }
//
// Cookie jest SZYFROWANE przez safeStorage (reużycie settings-crypto). `getStore` i
// `settings-crypto` są importowane DYNAMICZNIE (ciągną electron), żeby import modułu
// nie wymagał Electrona (np. w testach registry/providerów).

import { domainMatches, GDRIVE_DOMAINS } from './types';

type CredMap = Record<string, { cookie?: string; token?: string; refresh?: string }>;

async function decrypt(value: string): Promise<string> {
  if (!value) return '';
  try {
    const { decryptSecret } = await import('../settings/settings-crypto');
    return decryptSecret(value);
  } catch {
    return value;
  }
}

// Token sesyjny (np. PikPak access_token) bywa JWT z `exp`. Wygasłego NIE używamy
// (oszczędza nieudane zapytania Bearer) i nie pokazujemy go jako „ustawiony".
function jwtExpired(token: string): boolean {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(token)) return false;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf-8')) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

async function writeField(
  providerId: string,
  field: 'cookie' | 'token' | 'refresh',
  value: string
): Promise<boolean> {
  try {
    const { getStore } = await import('../cover/cover-cache');
    const { encryptSecret } = await import('../settings/settings-crypto');
    const encrypted = encryptSecret(typeof value === 'string' ? value.slice(0, 8192) : '');
    const store = await getStore();
    const all = (store.get('providerCredentials') as CredMap | undefined) || {};
    all[providerId] = { ...all[providerId], [field]: encrypted };
    store.set('providerCredentials', all);
    return true;
  } catch {
    return false;
  }
}

async function readMap(): Promise<CredMap> {
  try {
    const { getStore } = await import('../cover/cover-cache');
    const store = await getStore();
    return (store.get('providerCredentials') as CredMap | undefined) || {};
  } catch {
    return {};
  }
}

// Fallback dla Google Drive: jeśli użytkownik zalogował się już kontem Google
// (partycja YouTube/Google `persist:youtube-auth`), użyj tej samej sesji Google.
async function fallbackGoogleSessionCookie(): Promise<string> {
  try {
    const { getSessionCookies } = await import('../../youtube/youtube-auth-session');
    const { hasSessionCookies } = await import('../../youtube/youtube-auth-cookies');
    const cookies = await getSessionCookies();
    if (hasSessionCookies(cookies, 'google.com').length === 0) return '';
    const filtered = cookies.filter((c) =>
      GDRIVE_DOMAINS.some((d) => domainMatches(c.domain || '', d))
    );
    return filtered.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

export async function getProviderCookie(providerId: string): Promise<string> {
  const all = await readMap();
  const stored = all[providerId]?.cookie || '';
  if (stored) return decrypt(stored);
  if (providerId === 'gdrive') {
    return fallbackGoogleSessionCookie();
  }
  return '';
}

// Token sesji (np. PikPak trzyma access_token w localStorage, nie w cookies). Wysyłany
// jako `Authorization: Bearer …`. Zapisywany analogicznie (szyfrowany safeStorage).
export async function getProviderToken(providerId: string): Promise<string> {
  const all = await readMap();
  const stored = all[providerId]?.token || '';
  if (!stored) return '';
  const token = await decrypt(stored);
  return jwtExpired(token) ? '' : token;
}

// Refresh token (np. PikPak) — do odświeżenia `token` po wygaśnięciu.
export async function getProviderRefresh(providerId: string): Promise<string> {
  const all = await readMap();
  const stored = all[providerId]?.refresh || '';
  return stored ? decrypt(stored) : '';
}

export async function setProviderRefresh(providerId: string, refresh: string): Promise<boolean> {
  return writeField(providerId, 'refresh', refresh);
}

export async function hasProviderCookie(providerId: string): Promise<boolean> {
  const all = await readMap();
  if (all[providerId]?.cookie) return true;
  if (all[providerId]?.token) return !jwtExpired(await decrypt(all[providerId].token as string));
  if (providerId === 'gdrive') {
    return !!(await fallbackGoogleSessionCookie());
  }
  return false;
}

export async function setProviderCookie(providerId: string, cookie: string): Promise<boolean> {
  // safeStorage niedostępne (brak keyringu) → writeField zwraca false (nie zapisujemy jawnie).
  return writeField(providerId, 'cookie', cookie);
}

export async function setProviderToken(providerId: string, token: string): Promise<boolean> {
  return writeField(providerId, 'token', token);
}

export async function clearProviderCookie(providerId: string): Promise<boolean> {
  try {
    const { getStore } = await import('../cover/cover-cache');
    const store = await getStore();
    const all = (store.get('providerCredentials') as CredMap | undefined) || {};
    delete all[providerId];
    store.set('providerCredentials', all);
    return true;
  } catch {
    return false;
  }
}
