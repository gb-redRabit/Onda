import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import { createMediaServer, type MediaServer } from '../media-server';
import { registerGenericStreamUrl } from '../media-server-stream-registry';
import { runCommand } from '../utils/exec';
import { whichInPath } from '../ipc/dependency-utils';
import { buildStreamGetArgs, parseStreamGetOutput } from '../ipc/youtube-utils';

// Opt-in network smoke test for the generic (non-YouTube) playback path.
// It runs the real yt-dlp extractor, registers the returned stream URL and
// fetches it through the real media-server proxy with a byte range.
//
// Enable with:
//   ONDA_NETWORK_TESTS=1 npx vitest run src/main/__tests__/generic-stream-network.test.ts
// Optional overrides:
//   ONDA_YTDLP   - absolute path to the yt-dlp binary
//   ONDA_BIN_DIR  - directory containing the yt-dlp binary (e.g. userData/bin)
//   ONDA_TEST_URLS - comma separated page URLs to test instead of the defaults
const enabled = process.env.ONDA_NETWORK_TESTS === '1';

const DEFAULT_URLS = [
  // Direct media file handled by the generic extractor.
  'https://download.samplelib.com/mp3/sample-6s.mp3',
  // Redirects to another public host, so the proxy revalidation is exercised.
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
        // Extractor/site availability is outside our control; report instead of
        // failing the whole suite, but require at least one URL to work.
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
