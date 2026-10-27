import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

const sourceBin = join(process.env.APPDATA ?? '', 'onda', 'bin');
const ffmpeg = join(sourceBin, 'ffmpeg.exe');
const ffprobe = join(sourceBin, 'ffprobe.exe');
const canClip = existsSync(ffmpeg) && existsSync(ffprobe);

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
  await page.getByTestId('clip-view').dispatchEvent('drop', { dataTransfer });
}

test.describe('video clipper', () => {
  // Media muszą leżeć poza katalogiem repo: profil użytkownika bywa pod
  // `.local`/`.config`, a `media:grantAccess` celowo nie przyznaje korzeni
  // oznaczonych jako wrażliwe. `test-results` w worktree pod `.local` dawał 403.
  const mediaDir = mkdtempSync(join(tmpdir(), 'onda-video-clipper-'));

  test.afterAll(() => {
    rmSync(mediaDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test.skip(!canClip, 'FFmpeg is not installed in the local Onda profile');

  test('cuts a clip in a separate tool window', async () => {
    const source = join(mediaDir, 'source.webm');
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
        'testsrc=size=160x90:rate=10:duration=3',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
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
      const [clipper] = await Promise.all([
        onda.app.waitForEvent('window'),
        page.getByTestId('tools-card-video-clipper').click()
      ]);
      clipper.on('pageerror', (error) => onda.pageErrors.push(error.message));
      await dismissWizard(clipper);
      await expect(clipper.getByTestId('clip-view')).toBeVisible();

      await dropFile(clipper, source);
      const timeline = clipper.getByTestId('clip-timeline');
      await expect
        .poll(async () => Number(await timeline.getAttribute('data-duration')))
        .toBeGreaterThan(2.5);
      await expect
        .poll(async () => timeline.locator('img').count(), { timeout: 15000 })
        .toBeGreaterThan(0);
      await timeline.scrollIntoViewIfNeeded();
      const box = await timeline.boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('timeline has no bounds');
      const pad = box.width * 0.08;
      const span = box.width * 0.84;
      await clipper.mouse.click(box.x + pad + span / 3, box.y + box.height / 2);
      await clipper.getByTestId('clip-set-start').click();
      await clipper.mouse.click(box.x + pad + (span * 2) / 3, box.y + box.height / 2);
      await clipper.getByTestId('clip-set-end').click();
      await expect(clipper.getByTestId('clip-start-label')).toHaveText('00:00:01:00');
      await expect(clipper.getByTestId('clip-end-label')).toHaveText('00:00:02:00');
      await expect(clipper.getByTestId('clip-snap')).toHaveAttribute('aria-pressed', 'true');
      await clipper.getByTestId('clip-loop').click();
      await expect(clipper.getByTestId('clip-loop')).toHaveAttribute('aria-pressed', 'true');
      await clipper.getByTestId('clip-loop').click();
      await clipper.getByTestId('clip-fit-selection').click();
      await expect(clipper.getByTestId('clip-zoom-label')).not.toHaveText(/^1×\s*$/);
      await clipper.getByTestId('clip-add').click();
      await expect(clipper.getByTestId('clip-list')).toContainText('00:00:01:00');
      await clipper.getByTestId('clip-container').selectOption('mkv');
      await clipper.getByTestId('clip-export').click();

      await expect(clipper.getByTestId('clip-job')).toHaveAttribute('data-status', 'done', {
        timeout: 30000
      });
      const outputPath = join(mediaDir, 'source (clip).mkv');
      expect(existsSync(outputPath)).toBe(true);
      const outputDuration = probeDuration(outputPath);
      expect(outputDuration).toBeGreaterThan(0.8);
      // Stream copy snaps to keyframes, so the exported clip may be longer than A/B.
      expect(outputDuration).toBeLessThan(2.5);
      await expect(page.locator('[data-testid="toast"][data-toast-type="success"]')).toBeVisible({
        timeout: 10000
      });

      const exactPath = join(mediaDir, 'source (clip 2).mkv');
      await clipper.getByTestId('clip-mode').selectOption('exact');
      await clipper.getByTestId('clip-export').click();
      await expect.poll(() => existsSync(exactPath), { timeout: 30000 }).toBe(true);
      await expect(clipper.getByTestId('clip-job')).toHaveAttribute('data-status', 'done');
      const exactDuration = probeDuration(exactPath);
      expect(exactDuration).toBeGreaterThan(0.8);
      expect(exactDuration).toBeLessThan(1.4);

      const gifPath = join(mediaDir, 'source (clip).gif');
      await clipper.getByTestId('clip-format').selectOption('gif');
      await clipper.getByTestId('clip-export').click();
      await expect
        .poll(() => (existsSync(gifPath) ? statSync(gifPath).size : 0), { timeout: 30000 })
        .toBeGreaterThan(1000);

      await clipper.getByTestId('clip-fit-second').click();
      await expect
        .poll(async () => timeline.locator('[data-tick-kind="frame"]').count(), { timeout: 10000 })
        .toBeGreaterThan(0);
      await expect
        .poll(async () => timeline.locator('[data-testid="clip-frame"]').count(), {
          timeout: 30000
        })
        .toBeGreaterThan(0);
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
