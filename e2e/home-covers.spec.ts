import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { findFfmpegTools } from './helpers/ffmpeg';
import { launchOnda, dismissWizard } from './helpers/app';

// Okładki na Stronie głównej: „Kontynuuj”, „Szybki powrót” i półki muszą pokazać
// okładkę tak samo jak Biblioteka. Wcześniej karty na górze renderowały `<video>`
// (czarna klatka przy niektórych kodekach), a reszta korzystała z klatki `still`.

const tools = findFfmpegTools();

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function createFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-home-covers-'));
  const icon = resolve(__dirname, '..', 'resources', 'icon.png');
  // MP3 z okładką w tagach ID3 — dokładnie ten przypadek, który działa w Bibliotece.
  execFileSync(tools!.ffmpeg, [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
    '-i',
    icon,
    '-map',
    '0:a',
    '-map',
    '1:v',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-c:v',
    'png',
    '-id3v2_version',
    '3',
    '-metadata:s:v',
    'title=Album cover',
    '-metadata:s:v',
    'comment=Cover (front)',
    '-metadata',
    'title=Cover Song',
    '-metadata',
    'artist=Cover Artist',
    '-metadata',
    'album=Cover Album',
    join(dir, 'cover.mp3')
  ]);
  return dir;
}

test.describe('home covers', () => {
  test.skip(!tools, 'FFmpeg is not installed in the profile, resources/ or PATH');
  test.skip(process.platform === 'darwin', 'macOS runner: Electron exits (SIGTRAP)');

  let dir = '';

  test.beforeEach(() => {
    dir = createFixture();
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('shows extracted covers on the home shelves and the continue card', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      await page.evaluate(async (folder) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('library:saveFolders', [folder]);
        await api.invoke('library:scan', [folder]);
      }, dir);
      await page.reload();
      await dismissWizard(page);

      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      const card = page.locator('[data-testid="library-track-card"]').first();
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.dblclick();

      await page.evaluate(() => {
        window.location.hash = '#/';
      });
      await expect(page.getByTestId('home-continue')).toBeVisible({ timeout: 15_000 });

      // Każda karta z okładką musi renderować obraz (data URL z pokrycia), a nie <video>.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const covers = Array.from(
                document.querySelectorAll(
                  '[data-testid="home-continue"] img, [data-testid="home-quick-picks"] img, [data-testid="home-shelf"] article img'
                )
              );
              return covers.filter((img) => (img as HTMLImageElement).src.startsWith('data:'))
                .length;
            }),
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
