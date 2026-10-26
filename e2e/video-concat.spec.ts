import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

const sourceBin = join(process.env.APPDATA ?? '', 'onda', 'bin');
const ffmpeg = join(sourceBin, 'ffmpeg.exe');
const ffprobe = join(sourceBin, 'ffprobe.exe');
const canConcat = existsSync(ffmpeg) && existsSync(ffprobe);

function probeDuration(path: string): number {
  return Number(
    execFileSync(
      ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        path
      ],
      { encoding: 'utf8' }
    ).trim()
  );
}

async function dropFiles(page: Page, inputs: string[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle((paths) => {
    const dt = new DataTransfer();
    const uris = paths.map(
      (path) =>
        'file:///' +
        path
          .replace(/\\/g, '/')
          .split('/')
          .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
          .join('/')
    );
    dt.setData('text/uri-list', uris.join('\n'));
    return dt;
  }, inputs);
  await page.getByTestId('concat-view').dispatchEvent('drop', { dataTransfer });
}

test.describe('video concat', () => {
  const resultsDir = join(process.cwd(), 'test-results');
  mkdirSync(resultsDir, { recursive: true });
  const mediaDir = mkdtempSync(join(resultsDir, 'video-concat-'));

  test.afterAll(() => {
    rmSync(mediaDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test.skip(!canConcat, 'FFmpeg is not installed in the local Onda profile');

  test('joins videos in a separate tool window', async () => {
    const source = join(mediaDir, 'first.webm');
    const second = join(mediaDir, 'second.webm');
    execFileSync(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x90:rate=10:duration=2',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '1M',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'libopus',
        '-shortest',
        source
      ],
      { windowsHide: true, stdio: 'ignore' }
    );
    copyFileSync(source, second);

    const onda = await launchOnda({
      profileSetup: (dir) => {
        mkdirSync(join(dir, 'bin'), { recursive: true });
        copyFileSync(ffmpeg, join(dir, 'bin', 'ffmpeg.exe'));
        copyFileSync(ffprobe, join(dir, 'bin', 'ffprobe.exe'));
      }
    });
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/tools';
      });
      await expect(page.getByTestId('tools-hub')).toBeVisible();
      const [concat] = await Promise.all([
        onda.app.waitForEvent('window'),
        page.getByTestId('tools-card-video-concat').click()
      ]);
      concat.on('pageerror', (error) => onda.pageErrors.push(error.message));
      await dismissWizard(concat);
      await expect(concat.getByTestId('concat-view')).toBeVisible();

      await dropFiles(concat, [source, second]);
      await expect(concat.getByTestId('concat-item')).toHaveCount(2);
      await concat.getByTestId('concat-container').selectOption('mkv');
      await concat.getByTestId('concat-export').click();
      await expect(concat.getByTestId('concat-job')).toHaveAttribute('data-status', 'done', {
        timeout: 30000
      });

      const output = join(mediaDir, 'first (concat).mkv');
      expect(existsSync(output)).toBe(true);
      expect(probeDuration(output)).toBeGreaterThan(3.2);
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
