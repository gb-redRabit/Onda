import { mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/logger';
import type { Job } from './download-helpers';
import { mapFilenameTemplate, buildFormatSelector, resolveOutputDir } from './download-helpers';
import { buildThumbnailArgs, buildSectionArgs } from './cover-spec';
import { buildSubtitleArgs } from './subtitle-args';
import { buildSponsorBlockArgs } from './sponsorblock';
import { readProxyArgs, readSpeedLimitArgs } from '../ipc/proxy-utils';
import { addAllowedRoot } from '../media-server';

// Base yt-dlp argument list for a download job, extracted from
// `download-manager.ts` (plan 2.8). Side effects are intentional: it ensures the
// output dir exists and is exposed to the local media server, and may clear
// `job.cover` / set `job.coverStatus` (mutates the job).

const AUDIO_QUALITY_MAP: Record<string, string> = {
  best: '0',
  high: '2',
  medium: '5',
  low: '9'
};

export async function buildBaseArgs(job: Job): Promise<string[]> {
  const dir = resolveOutputDir(job);
  await mkdir(dir, { recursive: true });
  // The media server only knows library folders + explicitly opened files.
  // A download into any other folder (e.g. default Downloads) would get 403 on
  // cover/playback requests, so grant access to the output dir up front — the
  // audio file and its animated-cover sibling land here.
  void addAllowedRoot(dir);
  const outputTemplate = join(dir, `${mapFilenameTemplate(job.filenameTemplate)}.%(ext)s`);
  // Guard against option injection: a URL starting with "-" would be parsed
  // as a yt-dlp flag.  Prepend "--" to end the options list, then validate.
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
      // Native: keep the best available audio stream without re-encoding.
      base.push('-f', buildFormatSelector(job.quality, 'audio'));
      // Thumbnail embedding requires a container conversion; skip it for
      // native audio (frame/clip covers are still processed afterwards).
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
        // WebM has no attached cover-art support — drop the thumbnail request.
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
  base.push(...(await readProxyArgs()));
  base.push(...(await readSpeedLimitArgs()));
  base.push('--', job.url);
  return base;
}
