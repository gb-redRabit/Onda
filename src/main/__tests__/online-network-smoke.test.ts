import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { whichInPath } from '../ipc/dependency/dependency-utils';

// Opcjonalny test sieciowy (dymny) dla YT/SC: realne rozwiązanie metadanych ORAZ
// pełne pobranie małego pliku przez prawdziwy yt-dlp. Uruchamiany jawnie:
//
//   npm run test:network:online
//   ONDA_NETWORK_TESTS=1 npx vitest run src/main/__tests__/online-network-smoke.test.ts
//
// Nadpisania URL-i (przydatne, gdy domyślne stają się niedostępne w regionie):
//   ONDA_TEST_YT_URL, ONDA_TEST_SC_URL
// Ścieżka binarki: ONDA_YTDLP lub ONDA_BIN_DIR (np. userData/bin) albo PATH.
//
// Domyślnie pomijany w CI — dostępność YouTube/SoundCloud jest poza naszą kontrolą.

const enabled = process.env.ONDA_NETWORK_TESTS === '1';

const PLATFORMS = [
  {
    name: 'youtube',
    url: process.env.ONDA_TEST_YT_URL || 'https://www.youtube.com/watch?v=BaW_jenozKc'
  },
  {
    name: 'soundcloud',
    url: process.env.ONDA_TEST_SC_URL || 'https://soundcloud.com/forss/flickermood'
  }
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

function ytdlp(bin: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`${error.message}\n${stderr}`));
        else resolve(stdout);
      }
    );
  });
}

const bin = enabled ? resolveYtdlp() : null;
let workDir = '';

beforeAll(() => {
  if (enabled) workDir = mkdtempSync(join(tmpdir(), 'onda-online-net-'));
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe.skipIf(!enabled)('YT/SC online smoke (ONDA_NETWORK_TESTS=1)', () => {
  it('resolves media metadata for at least one platform', async () => {
    expect(bin, 'Set ONDA_YTDLP / ONDA_BIN_DIR or add yt-dlp to PATH').not.toBeNull();
    const failures: string[] = [];
    let verified = 0;
    for (const p of PLATFORMS) {
      try {
        const stdout = await ytdlp(bin as string, [p.url, '--no-warnings', '--no-playlist', '-J']);
        const info = JSON.parse(stdout) as { id?: string; title?: string };
        expect(info.id, `${p.name}: missing id`).toBeTruthy();
        expect(info.title, `${p.name}: missing title`).toBeTruthy();
        verified++;
      } catch (e) {
        failures.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (failures.length) console.warn('[online-smoke] resolve failures:\n' + failures.join('\n'));
    expect(verified, `no platform could be resolved:\n${failures.join('\n')}`).toBeGreaterThan(0);
  });

  it('downloads a whole small file for at least one platform', async () => {
    expect(bin, 'Set ONDA_YTDLP / ONDA_BIN_DIR or add yt-dlp to PATH').not.toBeNull();
    const failures: string[] = [];
    let verified = 0;
    for (const p of PLATFORMS) {
      const dir = join(workDir, p.name);
      try {
        await ytdlp(bin as string, [
          p.url,
          '--no-playlist',
          '--no-warnings',
          '--max-filesize',
          '10M',
          '-f',
          'worst',
          '-o',
          join(dir, '%(id)s.%(ext)s')
        ]);
        const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.endsWith('.part')) : [];
        const sizes = files.map((f) => statSync(join(dir, f)).size);
        expect(files.length, `${p.name}: no output file`).toBeGreaterThan(0);
        expect(Math.max(...sizes), `${p.name}: empty output file`).toBeGreaterThan(0);
        verified++;
      } catch (e) {
        failures.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (failures.length) console.warn('[online-smoke] download failures:\n' + failures.join('\n'));
    expect(verified, `no platform could be downloaded:\n${failures.join('\n')}`).toBeGreaterThan(0);
  }, 300_000);
});
