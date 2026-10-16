import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { logger } from '../../../shared/logger';
import {
  e2eFixturesEnabled,
  e2eProviderAuthList,
  e2eProviderDetect,
  e2eProviderDownloaded,
  e2eProviderList
} from '../../e2e-fixtures';
import { classifyYtDlpError } from '../../downloads/error-classifier';
import type {
  RemoteSubscriptionInput,
  RemoteSubscriptionPatch
} from '../../../shared/types/providers';
import { createPinnedLookup, resolveNetworkTarget } from '../network-target';
import type { ResolvedNetworkTarget } from '../network-target';
import {
  detectProvider,
  getProvider,
  listProviderFolder,
  listProvidersRequiringAuth,
  resolveProviderFileUrl
} from './registry';
import {
  addRemoteSubscription,
  loadRemoteSubscriptions,
  removeRemoteSubscription,
  sanitizeProviderRef,
  updateRemoteSubscription
} from './remote-subs-store';
import { loadProviderDownloaded, markProviderDownloaded } from './providers-downloaded-store';
import { setProviderItemDownloadedHandler } from '../../downloads/download-manager';
import {
  registerProviderStream,
  type ProviderStreamFactory,
  type ProviderStreamRange
} from '../../media/media-server-stream-registry';
import { detectProviderLimit } from './provider-limits';
import { getStore } from '../cover/cover-cache';
import { clearProviderCookie, hasProviderCookie, setProviderCookie } from './provider-credentials';
import { startProviderLogin, listLoginProviderIds } from './provider-login';
import {
  checkRemoteSubscriptions,
  looksExpired,
  startLinkSubsChecker,
  stopLinkSubsChecker
} from './remote-subs-checker';

// IPC providerów linków. `providers:detect` rozpoznaje serwis po URL; `providers:list`
// przegląda folder (z cache; `force` omija cache). `providers:streamUrl` wystawia strumień
// przez proxy `/stream?provider=<token>`. Pobranie enqueuje renderer przez `yt:download:add`
// (source.mode = 'provider'). Kanały `providers:subs:*` obsługują subskrypcje LINKÓW
// (trwałe, w JSON) — z ostrzeżeniem o wygasaniu.

const sanitizeRef = sanitizeProviderRef;
const MAX_STREAM_REDIRECTS = 5;
const STREAM_UPSTREAM_TIMEOUT_MS = 30_000;

function subsFile(): string {
  return join(app.getPath('userData'), 'remote-subscriptions.json');
}

function downloadedFile(): string {
  return join(app.getPath('userData'), 'providers-downloaded.json');
}

// Opt-in (domyślnie WYŁĄCZONE): okresowe sprawdzanie subskrypcji linków co 6h.
async function isAutoCheckLinkSubsEnabled(): Promise<boolean> {
  try {
    const store = await getStore();
    const download = store.get('download') as { autoCheckLinkSubscriptions?: boolean } | undefined;
    return !!download?.autoCheckLinkSubscriptions;
  } catch {
    return false;
  }
}

export async function syncLinkSubsScheduler(): Promise<void> {
  if (await isAutoCheckLinkSubsEnabled()) startLinkSubsChecker(subsFile());
  else stopLinkSubsChecker();
}

// Otwiera strumień HTTP z nagłówkami providera (np. Referer/UA dla PikPak) i opcjonalnym
// zakresem bajtów. Używane przez fabrykę strumienia providera (proxy `/stream?provider=`).
// Każdy skok przekierowania jest walidowany przez `resolveNetworkTarget` (ochrona przed SSRF
// do loopback/LAN/metadata), a zmiana originu zdejmuje poświadczenia (`Cookie`/`Authorization`).
export async function openHttpStream(
  url: string,
  headers: Record<string, string>,
  range?: ProviderStreamRange,
  fallbackMime?: string
): Promise<{ stream: NodeJS.ReadableStream; mime?: string; size?: number }> {
  const baseHeaders: Record<string, string> = { ...headers };
  if (range) baseHeaders.Range = `bytes=${range.start}-${range.end ?? ''}`;
  let currentUrl = url;
  let reqHeaders = baseHeaders;

  for (let hop = 0; hop <= MAX_STREAM_REDIRECTS; hop++) {
    // Walidacja SSRF ORAZ PRZYPIĘCIE połączenia do zwalidowanych adresów IP.
    // Wcześniej walidowano `resolveNetworkTarget`, ale połączenie szło przez globalny
    // `fetch()`, który samodzielnie rozwiązuje DNS — domena kontrolowana przez
    // atakującego mogła zwrócić publiczny adres przy walidacji, a prywatny przy
    // połączeniu (DNS-rebinding → dostęp do loopback/LAN/metadanych).
    const target = await resolveNetworkTarget(currentUrl);
    const res = await openPinnedStream(target, reqHeaders);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.resume();
      if (hop === MAX_STREAM_REDIRECTS) throw new Error('Too many redirects');
      const nextUrl = new URL(location, currentUrl).toString();
      // Przy zmianie originu zdejmij WSZYSTKIE nagłówki wywołującego (Cookie,
      // Authorization, Referer, podszywany UA), a nie tylko dwa pierwsze.
      if (new URL(nextUrl).origin !== new URL(currentUrl).origin) reqHeaders = {};
      currentUrl = nextUrl;
      continue;
    }
    if (status !== 200 && status !== 206) {
      res.resume();
      throw new Error(`HTTP ${status}`);
    }
    const upstreamCt = res.headers['content-type'] || '';
    logger.info(
      'providers',
      `stream upstream ${status} ct=${upstreamCt || '?'} host=${(() => {
        try {
          return new URL(currentUrl).hostname;
        } catch {
          return '?';
        }
      })()}`
    );
    // Preferuj konkretny typ multimedialny z upstreamu; inaczej użyj podpowiedzi z rozszerzenia
    // (PikPak/MEGA często serwują `application/octet-stream`, którego <video> nie odtworzy).
    const mime = /^(video|audio|image)\//i.test(upstreamCt)
      ? upstreamCt
      : fallbackMime || upstreamCt || 'application/octet-stream';
    const contentRange = res.headers['content-range'] || '';
    const size =
      Number(contentRange.split('/')[1] || res.headers['content-length'] || 0) || undefined;
    return { stream: res, mime, size };
  }
  throw new Error('Too many redirects');
}

// Otwiera strumień przez `http(s).request` z przypiętym DNS (`createPinnedLookup`),
// więc połączenie trafia dokładnie w adresy zwalidowane przez `resolveNetworkTarget`.
function openPinnedStream(
  target: ResolvedNetworkTarget,
  headers: Record<string, string>
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const transport = target.url.protocol === 'https:' ? https : http;
    const req = transport.request(
      target.url,
      { method: 'GET', headers, lookup: createPinnedLookup(target.addresses) },
      resolve
    );
    req.setTimeout(STREAM_UPSTREAM_TIMEOUT_MS, () => {
      req.destroy(new Error('upstream timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

// Czeka na pierwszy bajt strumienia, żeby wykryć błąd providera (np. limit) ZANIM
// odtwarzacz przejmie widok. Timeout uznajemy za sukces (nie blokujemy odtwarzania).
function probeReadable(stream: NodeJS.ReadableStream, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        (stream as import('stream').Readable).destroy?.();
      } catch {
        /* już zamknięty */
      }
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => done(), timeoutMs);
    stream.once('data', () => done());
    stream.once('end', () => done());
    stream.once('error', (e) => done(e instanceof Error ? e : new Error(String(e))));
  });
}

export function registerProvidersHandlers(): void {
  // Ukończone pobranie providera trwale zapisuje „✓ pobrano" (przetrwa restart).
  setProviderItemDownloadedHandler((providerId, ref, itemId) => {
    void markProviderDownloaded(downloadedFile(), providerId || ref.provider, ref.shareId, [
      itemId
    ]);
  });

  ipcMain.handle('providers:detect', async (_event, url: string) =>
    e2eFixturesEnabled()
      ? e2eProviderDetect(typeof url === 'string' ? url : '')
      : detectProvider(url)
  );

  ipcMain.handle(
    'providers:list',
    async (_event, opts: { ref?: unknown; folderId?: string; force?: boolean }) => {
      if (e2eFixturesEnabled()) {
        return {
          success: true,
          items: e2eProviderList(typeof opts?.folderId === 'string' ? opts.folderId : undefined)
        };
      }
      const ref = sanitizeRef(opts?.ref);
      if (!ref) return { success: false, error: 'Invalid provider ref', items: [] };
      try {
        const items = await listProviderFolder(
          ref,
          typeof opts?.folderId === 'string' ? opts.folderId : undefined,
          opts?.force === true
        );
        return { success: true, items };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('providers', 'list failed', msg);
        return { success: false, error: msg, code: classifyYtDlpError(msg), items: [] };
      }
    }
  );

  // ── Poświadczenia providerów (cookie) ──────────────────────────────────────
  ipcMain.handle('providers:auth:list', async () => {
    if (e2eFixturesEnabled()) return e2eProviderAuthList();
    // Wymagające cookie (auth !== 'none') ORAZ te, dla których logowanie jest OPCJONALNE
    // (np. Google Drive — publiczne linki działają bez logowania, prywatne wymagają).
    const map = new Map<string, { id: string; label: string; icon: string; required: boolean }>();
    for (const p of listProvidersRequiringAuth()) map.set(p.id, { ...p, required: true });
    for (const id of listLoginProviderIds()) {
      if (map.has(id)) continue;
      const p = getProvider(id);
      if (p) map.set(id, { id: p.id, label: p.label, icon: p.icon, required: false });
    }
    return Promise.all(
      [...map.values()].map(async (p) => ({ ...p, hasCookie: await hasProviderCookie(p.id) }))
    );
  });
  ipcMain.handle('providers:cred:get', async (_event, providerId: string) => ({
    hasCookie: typeof providerId === 'string' ? await hasProviderCookie(providerId) : false
  }));
  ipcMain.handle(
    'providers:cred:set',
    async (_event, input: { providerId?: string; cookie?: string }) => {
      if (typeof input?.providerId !== 'string' || typeof input?.cookie !== 'string') return false;
      return setProviderCookie(input.providerId, input.cookie);
    }
  );
  ipcMain.handle('providers:cred:clear', async (_event, providerId: string) =>
    typeof providerId === 'string' ? clearProviderCookie(providerId) : false
  );
  ipcMain.handle(
    'providers:cred:login',
    async (
      _event,
      providerId: string
    ): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
      typeof providerId === 'string'
        ? startProviderLogin(providerId)
        : { success: false, error: 'Invalid provider' }
  );

  // ── Subskrypcje linków ─────────────────────────────────────────────────────
  ipcMain.handle(
    'providers:downloaded',
    async (_event, opts: { provider?: string; shareId?: string }) => {
      if (e2eFixturesEnabled()) return e2eProviderDownloaded();
      if (typeof opts?.provider !== 'string' || typeof opts?.shareId !== 'string') return [];
      return loadProviderDownloaded(downloadedFile(), opts.provider, opts.shareId);
    }
  );

  ipcMain.handle('providers:subs:list', async () => loadRemoteSubscriptions(subsFile()));

  // Podgląd/odtwarzanie w aplikacji. WSZYSTKO idzie przez `/stream?provider=<token>`:
  // dla providerów z URL-em fabryka pobiera upstream z NAGŁÓWKAMI providera (np. Referer)
  // i przekazuje zakresy; dla strumieni (MEGA) zwraca deszyfrowany strumień.
  ipcMain.handle(
    'providers:streamUrl',
    async (_event, opts: { ref?: unknown; itemId?: string; mime?: string }) => {
      const ref = sanitizeRef(opts?.ref);
      if (!ref || typeof opts?.itemId !== 'string' || !opts.itemId) {
        return { success: false, error: 'Invalid request' };
      }
      const fallbackMime = typeof opts.mime === 'string' && opts.mime ? opts.mime : undefined;
      try {
        const resolved = await resolveProviderFileUrl(ref.provider, ref, opts.itemId);
        let factory: ProviderStreamFactory;
        if (resolved.url) {
          const url = resolved.url;
          const headers = resolved.headers || {};
          factory = (range) => openHttpStream(url, headers, range, fallbackMime);
        } else if (resolved.stream) {
          // Początkowy strumień (bez zakresu) jest tylko SYGNAŁEM — właściwy powstaje w
          // fabryce. Niszczymy go, żeby nie zostawiać otwartego pobrania (np. MEGA).
          try {
            (resolved.stream as Readable).destroy?.();
          } catch {
            /* ignoruj */
          }
          const providerId = ref.provider;
          const itemId = opts.itemId;
          factory = async (range) => {
            const fresh = await resolveProviderFileUrl(providerId, ref, itemId, range);
            if (!fresh.stream) throw new Error('Brak strumienia providera');
            return {
              stream: fresh.stream,
              mime: fallbackMime || 'application/octet-stream',
              size: fresh.size
            };
          };
        } else {
          return { success: false, error: 'Nie można odtworzyć tego pliku' };
        }

        const token = registerProviderStream(factory);

        // Pre-flight: upewnij się, że strumień startuje (1 bajt), ZANIM player przejmie
        // widok — dzięki temu limit/niedostępność pokazuje się w panelu (bez skoku do playera).
        try {
          const probe = await factory({ start: 0, end: 1 });
          await probeReadable(probe.stream);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.warn('providers', 'stream preflight failed', msg);
          return {
            success: false,
            error: msg,
            code: detectProviderLimit(msg).limited ? 'rate-limited' : classifyYtDlpError(msg)
          };
        }

        return { success: true, streamToken: token };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('providers', 'streamUrl failed', msg);
        return { success: false, error: msg };
      }
    }
  );

  ipcMain.handle('providers:subs:add', async (_event, input: RemoteSubscriptionInput) => {
    const url = typeof input?.url === 'string' ? input.url.trim() : '';
    if (!url) return null;
    const detected = detectProvider(url);
    if (!detected) return null;
    return addRemoteSubscription(
      subsFile(),
      { url, title: input?.title || detected.label },
      detected.id,
      detected.ref
    );
  });

  ipcMain.handle('providers:subs:remove', async (_event, id: string) =>
    removeRemoteSubscription(subsFile(), id)
  );

  ipcMain.handle(
    'providers:subs:update',
    async (_event, id: string, patch: RemoteSubscriptionPatch) =>
      updateRemoteSubscription(subsFile(), id, patch)
  );

  ipcMain.handle('providers:subs:check', async (_event, id: string) => {
    const subs = await loadRemoteSubscriptions(subsFile());
    const sub = subs.find((s) => s.id === id);
    if (!sub) return null;
    try {
      // `force` omija cache folderów — ręczne „Sprawdź" ma realnie odpytać serwis.
      await listProviderFolder(sub.ref, undefined, true);
      return updateRemoteSubscription(subsFile(), id, { status: 'ok', lastCheckedAt: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('providers', 'subs check failed', msg);
      return updateRemoteSubscription(subsFile(), id, {
        status: looksExpired(msg) ? 'expired' : 'error',
        lastCheckedAt: Date.now()
      });
    }
  });

  // Ręczne „sprawdź wszystkie" (z wykrywaniem nowych pozycji) — zwraca odświeżoną listę.
  ipcMain.handle('providers:subs:checkAll', async () => {
    await checkRemoteSubscriptions(subsFile());
    return loadRemoteSubscriptions(subsFile());
  });
}
