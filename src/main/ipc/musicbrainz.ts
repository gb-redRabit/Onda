import { ipcMain } from 'electron';
import https from 'https';
import http from 'http';
import type { MusicbrainzRelease } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';

let appVersion = '0.4.0';
try {
  const pkg = require('../../../package.json') as { version?: string };
  if (pkg.version) appVersion = pkg.version;
} catch {}
const USER_AGENT = `Onda/${appVersion} (onda-player.app; contact: onda-player.app)`;
const MB_URL = 'https://musicbrainz.org/ws/2';
const CA_URL = 'https://coverartarchive.org';

// MusicBrainz wymaga 1 req/s — kolejka w main
let lastMbRequest = 0;
async function throttleMb() {
  const now = Date.now();
  const wait = 1000 - (now - lastMbRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastMbRequest = Date.now();
}

function mbFetch(url: string): Promise<Record<string, unknown> | string> {
  return throttleMb().then(
    () =>
      new Promise<Record<string, unknown> | string>((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
    let total = 0;
    const MAX_JSON = 2 * 1024 * 1024; // 2 MB
    const req = protocol.get(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      (res) => {
        // rate-limit 503 z Retry-After
        if (res.statusCode === 503) {
          const retryAfter = Number(res.headers['retry-after'] || '2');
          setTimeout(() => mbFetch(url).then(resolve, reject), Math.min(retryAfter * 1000, 5000));
          return;
        }
        let data = '';
        res.on('data', (chunk: string) => {
          total += chunk.length;
          if (total > MAX_JSON) {
            req.destroy();
            reject(new Error('Response too large'));
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as Record<string, unknown>);
            } catch (e) {
              logger.warn('musicbrainz', 'non-JSON response', url, e);
              resolve(data);
            }
          } else if (res.statusCode === 429 || res.statusCode === 503) {
            reject(Object.assign(new Error(`Rate limited HTTP ${res.statusCode}`), { rateLimited: true }));
          } else {
            const kind = res.statusCode === 404 ? 'not-found' : res.statusCode === 503 ? 'rate-limit' : 'http';
            reject(Object.assign(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`), { errorKind: kind }));
          }
        });
      }
    );
    req.on('error', (e) => reject(Object.assign(e, { errorKind: 'network' })));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(Object.assign(new Error('Timeout'), { errorKind: 'timeout' }));
    });
      })
  );
}

function fetchCoverWithRedirect(url: string, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (redirects > 3) return reject(new Error('Too many redirects'));
    https
      .get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          fetchCoverWithRedirect(next, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const chunks: Buffer[] = [];
          let total = 0;
          const MAX_COVER = 10 * 1024 * 1024;
          res.on('data', (c: Buffer) => {
            total += c.length;
            if (total > MAX_COVER) {
              res.destroy();
              reject(new Error('Cover too large'));
              return;
            }
            const ct = res.headers['content-type'] || '';
            if (ct && !String(ct).startsWith('image/') && total < 1024) {
              // allow but warn
            }
            chunks.push(c);
          });
          res.on('end', () => resolve(Buffer.concat(chunks)));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      })
      .on('error', reject);
  });
}

export function registerMusicBrainzHandlers() {
  ipcMain.handle('musicbrainz:searchRelease', async (_event, query: string) => {
    try {
      const q = encodeURIComponent(query);
      const res = await mbFetch(`${MB_URL}/release/?query=${q}&fmt=json&limit=10`);
      const data = typeof res === 'string' ? { releases: [] } : res;
      const releases = (data.releases as MusicbrainzRelease[] | undefined) || [];
      return { success: true, releases };
    } catch (e) {
      return { success: false, error: String(e), releases: [] };
    }
  });

  ipcMain.handle('musicbrainz:lookupRelease', async (_event, releaseId: string) => {
    try {
      const res = await mbFetch(
        `${MB_URL}/release/${releaseId}?inc=recordings+artist-credits+labels&fmt=json`
      );
      if (typeof res === 'string') {
        return { success: false, error: 'Invalid response' };
      }
      return { success: true, release: res as unknown as MusicbrainzRelease };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle(
    'musicbrainz:getCoverData',
    async (
      _event,
      releaseId: string
    ): Promise<{ success: boolean; data?: number[]; mime?: string; error?: string; rateLimited?: boolean }> => {
      try {
        const buf = await fetchCoverWithRedirect(`${CA_URL}/release/${releaseId}/front`);
        return { success: true, data: Array.from(buf), mime: 'image/jpeg' };
      } catch (e: unknown) {
        const msg = String(e);
        const rateLimited = msg.includes('429') || msg.includes('503');
        return { success: false, error: msg, rateLimited };
      }
    }
  );

  // 8.9 — autodetect + batch
  ipcMain.handle('musicbrainz:autodetect', async (_event, query: string) => {
    try {
      const q = encodeURIComponent(query);
      const res = await mbFetch(`${MB_URL}/release/?query=${q}&fmt=json&limit=5`);
      const data = typeof res === 'string' ? { releases: [] } : res;
      const releases = (data.releases as MusicbrainzRelease[] | undefined) || [];
      if (releases.length === 0) return { success: true, match: 'none', releases };
      // pewność: score 100 lub 1 wynik znacznie wyższy
      const top = releases[0] as unknown as { score?: string };
      const score = Number(top.score || 0);
      const secondScore = Number((releases[1] as unknown as { score?: string })?.score || 0);
      const match = score >= 90 && score - secondScore > 20 ? 'certain' : releases.length === 1 ? 'certain' : 'ambiguous';
      return { success: true, match, releases };
    } catch (e) {
      return { success: false, error: String(e), match: 'none', releases: [] };
    }
  });

  ipcMain.handle('musicbrainz:batchApply', async (_event, _payload: unknown) => {
    // placeholder — renderer iteruje per utwór i woła lookup+getCover, main tylko throttluje
    return { success: true };
  });
}
