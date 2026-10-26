import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

const sourceBin = join(process.env.APPDATA ?? '', 'onda', 'bin');
const ffmpeg = join(sourceBin, 'ffmpeg.exe');
const ffprobe = join(sourceBin, 'ffprobe.exe');
const canConvert = existsSync(ffmpeg) && existsSync(ffprobe);

async function dropFile(page: Page, input: string): Promise<void> {
  const dataTransfer = await page.evaluateHandle((path) => {
    const dt = new DataTransfer();
    const uri =
      'file:///' +
      path
        .replace(/\\/g, '/')
        .split('/')
        .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
        .join('/');
    dt.setData('text/uri-list', uri);
    return dt;
  }, input);
  await page
    .locator('[data-testid="tools-converter-view"] section')
    .first()
    .dispatchEvent('drop', { dataTransfer });
}

test.describe('tools conversion', () => {
  const media = createMediaFixture();

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test.skip(!canConvert, 'FFmpeg is not installed in the local Onda profile');

  test('converts dropped audio and video through the tools view', async () => {
    const videoPath = join(media.dir, 'clip.mp4');
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
        'color=c=black:s=64x64:d=1',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-c:v',
        'mpeg4',
        '-q:v',
        '3',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        videoPath
      ],
      { windowsHide: true, stdio: 'ignore' }
    );

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
      const [converter] = await Promise.all([
        onda.app.waitForEvent('window'),
        page.getByTestId('tools-card-converter').click()
      ]);
      converter.on('pageerror', (error) => onda.pageErrors.push(error.message));
      await dismissWizard(converter);
      await expect(converter.getByTestId('tools-converter-view')).toBeVisible();
      await expect(converter.getByTestId('tools-add-files')).toBeVisible();
      await expect(converter.getByTestId('tools-convert')).toBeDisabled();

      await dropFile(converter, media.wavPath);
      await expect(converter.getByText('tone.wav')).toBeVisible();
      await converter.getByTestId('tools-convert').click();
      await expect(converter.getByTestId('tools-job-done')).toBeVisible({ timeout: 20000 });
      expect(existsSync(join(media.dir, 'tone.mp3'))).toBe(true);
      await expect(page.locator('[data-testid="toast"][data-toast-type="success"]')).toBeVisible({
        timeout: 10000
      });

      await converter.getByTestId('tools-kind-video').click();
      await expect(converter.getByTestId('tools-convert')).toBeDisabled();
      await dropFile(converter, videoPath);
      await expect(converter.getByText('clip.mp4')).toBeVisible();
      await converter.getByTestId('tools-video-format').selectOption('mkv');
      await converter.getByTestId('tools-convert').click();
      await expect(converter.getByTestId('tools-job-done')).toBeVisible({ timeout: 30000 });
      expect(existsSync(join(media.dir, 'clip.mkv'))).toBe(true);
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
