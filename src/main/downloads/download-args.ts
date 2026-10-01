import { mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/logger';
import type { Job } from './download-helpers';
import { mapFilenameTemplate, buildFormatSelector, resolveOutputDir } from './download-helpers';
import { buildThumbnailArgs, buildSectionArgs } from './cover-spec';
import { buildSubtitleArgs } from './subtitle-args';
import { buildSponsorBlockArgs } from './sponsorblock';
import { readNetworkArgs, readSpeedLimitArgs } from '../ipc/proxy-utils';
import { addAllowedRoot } from '../media/media-server';

// Bazowa lista argumentów yt-dlp dla zadania pobierania, wyodrębniona z
// `download-manager.ts` (plan 2.8). Efekty uboczne są zamierzone: zapewnia, że
// katalog wyjściowy istnieje i jest udostępniony lokalnemu serwerowi mediów, oraz
// może wyczyścić `job.cover` / ustawić `job.coverStatus` (modyfikuje zadanie).

const AUDIO_QUALITY_MAP: Record<string, string> = {
  best: '0',
  high: '2',
  medium: '5',
  low: '9'
};

export async function buildBaseArgs(job: Job): Promise<string[]> {
  const dir = resolveOutputDir(job);
  await mkdir(dir, { recursive: true });
  // Serwer mediów zna tylko foldery biblioteki + jawnie otwarte pliki.
  // Pobieranie do innego folderu (np. domyślnego Downloads) dostałoby 403 na
  // żądaniach covera/odtwarzania, więc przyznaj dostęp do katalogu wyjściowego z góry —
  // trafiają tu plik audio i towarzyszący mu animowany cover.
  void addAllowedRoot(dir);
  const outputTemplate = join(dir, `${mapFilenameTemplate(job.filenameTemplate)}.%(ext)s`);
  // Zabezpieczenie przed wstrzyknięciem opcji: URL zaczynający się od "-" zostałby
  // sparsowany jako flaga yt-dlp. Dodaj "--" na końcu listy opcji, potem waliduj.
  if (!job.url.startsWith('https://') && !job.url.startsWith('http://')) {
    throw new Error(`Invalid download URL: rejected non-http(s) scheme`);
  }
  const base: string[] = [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--continue',
    '-o',
    outputTemplate
  ];
  if (job.kind === 'audio') {
    if (job.format === 'best') {
      // Natywnie: zachowaj najlepszy dostępny strumień audio bez ponownego kodowania.
      base.push('-f', buildFormatSelector(job.quality, 'audio'));
      // Osadzanie miniatury wymaga konwersji kontenera; pomiń je dla
      // natywnego audio (covery frame/clip są i tak przetwarzane później).
      if (job.cover?.type === 'thumbnail') job.cover = undefined;
    } else {
      base.push(
        '--extract-audio',
        '--audio-format',
        job.format,
        '--audio-quality',
        AUDIO_QUALITY_MAP[job.audioQuality || 'best'] || '0',
        '--embed-metadata',
        '--embed-chapters'
      );
      if (job.cover?.type === 'thumbnail') {
        base.push(...buildThumbnailArgs());
        job.coverStatus = 'fetching';
      }
    }
  } else {
    base.push(
      '-f',
      buildFormatSelector(job.quality, 'video'),
      '--merge-output-format',
      job.videoContainer || 'mp4',
      '--embed-metadata',
      '--embed-chapters'
    );
    if (job.cover?.type === 'thumbnail') {
      if (job.videoContainer === 'webm') {
        // WebM nie obsługuje dołączanej okładki — odrzuć żądanie miniatury.
        job.cover = undefined;
      } else {
        base.push(...buildThumbnailArgs());
        job.coverStatus = 'fetching';
      }
    }
  }
  if (job.audioLanguage) {
    base.push('--audio-language', job.audioLanguage);
  }
  base.push(...buildSponsorBlockArgs(job.sponsorBlock));
  if (job.source?.headers) {
    for (const [name, value] of Object.entries(job.source.headers)) {
      if (!name || !value) continue;
      base.push('--add-header', `${name}: ${value}`);
    }
  }
  if (
    typeof job.trimStart === 'number' &&
    typeof job.trimEnd === 'number' &&
    job.trimEnd > job.trimStart
  ) {
    base.push(...buildSectionArgs(job.trimStart, job.trimEnd));
  }
  if (job.subsLangs) {
    logger.info('downloads', `subtitle download enabled for ${job.id} (langs=${job.subsLangs})`);
    base.push(
      ...buildSubtitleArgs({
        langs: job.subsLangs,
        format: job.subsFormat,
        mode: job.subsMode,
        kind: job.kind,
        embed: job.kind === 'video'
      })
    );
  }
  // Proxy/User-Agent per platforma wynikają ze źródła zadania (ytdlp = YouTube).
  base.push(
    ...(await readNetworkArgs(job.source?.mode === 'soundcloud' ? 'soundcloud' : 'youtube'))
  );
  base.push(...(await readSpeedLimitArgs()));
  base.push('--', job.url);
  return base;
}
