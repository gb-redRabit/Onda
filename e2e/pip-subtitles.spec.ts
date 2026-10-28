import { test, expect } from '@playwright/test';
import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import sharp from 'sharp';
import { dismissWizard, launchOnda } from './helpers/app';

// Regresja CSP/JASSUB: PiP ładuje WASM jako data URL i renderuje napisy na
// własnym canvasie. Bez `data:` w connect-src JASSUB nie startuje, a test
// sprawdza nie tylko obecność canvasa, ale też niepuste piksele.
const FIXTURE = resolve(__dirname, 'fixtures', 'sample.webm');

const ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H000000FF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,Subtitle E2E
`;

interface PipApi {
  grantMediaAccess: (filePath: string) => Promise<boolean>;
  getMediaServerUrl: () => Promise<string>;
  pipStart: (
    src: string,
    settings?: {
      width?: number;
      height?: number;
      subtitle?: {
        subContent: string;
        fonts: Array<{ name: string; data: number[] }>;
        availableFonts: Record<string, string>;
      } | null;
    }
  ) => Promise<boolean>;
}

test.describe('video PiP subtitles', () => {
  test('renders JASSUB subtitles after CSP hardening', async () => {
    // Fixture musi leżeć poza repo: worktree bywa pod `.local`, a serwer mediów
    // celowo nie przyznaje wrażliwych korzeni.
    const fixtureDir = mkdtempSync(join(tmpdir(), 'onda-pip-subtitles-'));
    const fixture = join(fixtureDir, 'sample.webm');
    copyFileSync(FIXTURE, fixture);
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(
        async (args) => {
          const api = (window as unknown as { api: PipApi }).api;
          await api.grantMediaAccess(args.path);
          const base = await api.getMediaServerUrl();
          const src = `${base}?path=${encodeURIComponent(args.path)}`;
          await api.pipStart(src, {
            width: 480,
            height: 270,
            subtitle: {
              subContent: args.subContent,
              fonts: [],
              availableFonts: {}
            }
          });
        },
        { path: fixture, subContent: ASS }
      );

      await expect
        .poll(() =>
          app.windows().some((w) => w.url().includes('/pip.html') && !w.url().includes('preview'))
        )
        .toBe(true);
      const pip = app
        .windows()
        .find((w) => w.url().includes('/pip.html') && !w.url().includes('preview'))!;
      const pipErrors: string[] = [];
      pip.on('pageerror', (error) => pipErrors.push(error.message));

      const canvas = pip.locator('canvas.JASSUB');
      await expect(canvas).toHaveCount(1, { timeout: 20_000 });
      // JASSUB przekazuje canvas do OffscreenCanvas, więc nie można czytać
      // pikseli z wątku strony. Sprawdzamy realny rozmiar bufora i brak błędów
      // inicjalizacji — to odróżnia działający WASM od pustego placeholdera.
      await expect
        .poll(
          async () =>
            canvas.evaluate((el) => {
              const canvasEl = el as HTMLCanvasElement;
              return canvasEl.width > 0 && canvasEl.height > 0 ? canvasEl.width : 0;
            }),
          { timeout: 20_000 }
        )
        .toBeGreaterThan(0);
      expect(pipErrors).toEqual([]);

      // Realny dowód renderowania: zrzut okna i czerwone piksele napisu.
      await pip.waitForTimeout(800);
      const shot = await pip.screenshot();
      const { data: pixels, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
      let redPixels = 0;
      for (let i = 0; i < pixels.length; i += info.channels) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 180 && g < 80 && b < 80) redPixels++;
      }
      expect(redPixels).toBeGreaterThan(20);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
      rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
