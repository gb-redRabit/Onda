import { ipcMain } from 'electron';
import https from 'https';
import http from 'http';

const USER_AGENT = 'Onda/1.0.0 (onda-player.app)';
const MB_URL = 'https://musicbrainz.org/ws/2';
const CA_URL = 'https://coverartarchive.org';

function mbFetch(url: string): Promise<Record<string, unknown> | string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as Record<string, unknown>);
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

export function registerMusicBrainzHandlers() {
  ipcMain.handle('musicbrainz:searchRelease', async (_event, query: string) => {
    try {
      const q = encodeURIComponent(query);
      const res = await mbFetch(`${MB_URL}/release/?query=${q}&fmt=json&limit=10`);
      const data = typeof res === 'string' ? { releases: [] } : (res as Record<string, unknown>);
      return { success: true, releases: ((data as any).releases || []) as any[] };
    } catch (e) {
      return { success: false, error: String(e), releases: [] };
    }
  });

  ipcMain.handle('musicbrainz:lookupRelease', async (_event, releaseId: string) => {
    try {
      const res = await mbFetch(
        `${MB_URL}/release/${releaseId}?inc=recordings+artist-credits+labels&fmt=json`
      );
      return { success: true, release: typeof res === 'string' ? {} : res };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle(
    'musicbrainz:getCoverData',
    async (
      _event,
      releaseId: string
    ): Promise<{ success: boolean; data?: number[]; mime?: string; error?: string }> => {
      try {
        const buf = await new Promise<Buffer>((resolve, reject) => {
          https
            .get(
              `${CA_URL}/release/${releaseId}/front`,
              { headers: { 'User-Agent': USER_AGENT } },
              (res) => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                  const chunks: Buffer[] = [];
                  res.on('data', (c: Buffer) => chunks.push(c));
                  res.on('end', () => resolve(Buffer.concat(chunks)));
                } else {
                  reject(new Error(`HTTP ${res.statusCode}`));
                }
              }
            )
            .on('error', reject);
        });
        return { success: true, data: Array.from(buf), mime: 'image/jpeg' };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }
  );
}
