import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import { createMediaServer, type MediaServer } from '../media/media-server';
import { registerGenericStreamUrl } from '../media/media-server-stream-registry';
import { runCommand } from '../utils/exec';
import { whichInPath } from '../ipc/dependency/dependency-utils';
import { buildStreamGetArgs, parseStreamGetOutput } from '../ipc/youtube/youtube-utils';

// Opcjonalny test sieciowy dymny dla ogólnej (nie-YouTube) ścieżki odtwarzania.
// Uruchamia prawdziwy ekstraktor yt-dlp, rejestruje zwrócony URL strumienia i
// pobiera go przez prawdziwe proxy media-server z zakresem bajtów.
//
// Włącz przez:
//   ONDA_NETWORK_TESTS=1 npx vitest run src/main/__tests__/generic-stream-network.test.ts
// Opcjonalne nadpisania:
//   ONDA_YTDLP   - bezwzględna ścieżka do pliku binarnego yt-dlp
//   ONDA_BIN_DIR  - katalog zawierający plik binarny yt-dlp (np. userData/bin)
//   ONDA_TEST_URLS - oddzielone przecinkami adresy URL stron do testowania zamiast domyślnych
const enabled = process.env.ONDA_NETWORK_TESTS === '1';

const DEFAULT_URLS = [
  // Bezpośredni plik multimedialny obsługiwany przez ogólny ekstraktor.
  'https://download.samplelib.com/mp3/sample-6s.mp3',
  // Przekierowuje do innego publicznego hosta, więc testowana jest rewalidacja w proxy.
  'https://archive.org/download/testmp3testfile/mpthreetest.mp3'
];

function resolveYtdlp(): string | null {
  if (process.env.ONDA_YTDLP) return process.env.ONDA_YTDLP;
  if (process.env.ONDA_BIN_DIR) {
    const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const candidate = join(process.env.ONDA_BIN_DIR, name);
    if (existsSync(candidate)) return candidate;
  }
  return whichInPath('yt-dlp');
}

const testUrls = (
  process.env.ONDA_TEST_URLS?.split(',').map((url) => url.trim()) ?? DEFAULT_URLS
).filter(Boolean);

let mediaServer: MediaServer;

beforeAll(async () => {
  mediaServer = await createMediaServer();
});

afterAll(() => {
  mediaServer?.close();
});

function proxyRange(
  streamUrl: string,
  range: string
): Promise<{ status: number; contentType: string | undefined; bytes: number }> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: mediaServer.port,
        path: `/${mediaServer.token}/stream?url=${encodeURIComponent(streamUrl)}`,
        headers: { range }
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            contentType: res.headers['content-type'],
            bytes
          })
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('proxy request timeout')));
  });
}

describe.skipIf(!enabled)('generic stream playback over the real network', () => {
  it('resolves a generic link with yt-dlp and proxies it through the media server', async () => {
    const bin = resolveYtdlp();
    expect(
      bin,
      'Set ONDA_YTDLP or ONDA_BIN_DIR to a yt-dlp binary before enabling this test'
    ).not.toBeNull();

    const failures: string[] = [];
    let verified = 0;

    for (const pageUrl of testUrls) {
      let streamUrl: string;
      try {
        const stdout = await runCommand(
          bin as string,
          buildStreamGetArgs(pageUrl, [], { generic: true }),
          { timeout: 60_000 }
        );
        const parsed = parseStreamGetOutput(stdout);
        expect(parsed.ok, `${pageUrl}: ${stdout}`).toBe(true);
        streamUrl = parsed.url as string;
      } catch (e) {
        // Dostępność ekstraktora/strony jest poza naszą kontrolą; zgłoś zamiast
        // przewalać cały zestaw, ale wymagaj, aby zadziałał co najmniej jeden URL.
        failures.push(`${pageUrl}: resolve failed (${e instanceof Error ? e.message : e})`);
        continue;
      }

      try {
        await registerGenericStreamUrl(streamUrl);
        const result = await proxyRange(streamUrl, 'bytes=0-2047');
        expect([200, 206], `${pageUrl} -> ${streamUrl}`).toContain(result.status);
        expect(result.bytes, `${pageUrl} -> ${streamUrl}`).toBeGreaterThan(0);
        expect(result.contentType ?? '', `${pageUrl} -> ${streamUrl}`).not.toBe('');
        verified++;
      } catch (e) {
        failures.push(`${pageUrl} -> ${streamUrl}: proxy failed (${String(e)})`);
      }
    }

    if (failures.length) {
      console.warn('[generic-stream-network] skipped targets:\n' + failures.join('\n'));
    }
    expect(verified, `no URL could be verified:\n${failures.join('\n')}`).toBeGreaterThan(0);
  }, 180_000);
});
