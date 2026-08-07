import type { SubtitleTrack, MkvFont } from '@renderer/types/subtitles';
import { convertToAss } from '@renderer/utils/subtitleConvert';
import { buildFontMap, releaseFontBlobUrls } from './subtitleFonts';
import {
  ensureJASSUB,
  newSubtitleLoadSeq,
  isSubtitleLoadCurrent,
  getVideoElement,
  setVideoElement,
  clearVideoElement,
  destroySubtitleInstance,
  createJassubInstance,
  saveLastSubtitleData,
  getLastSubtitleData,
  type SubtitleData
} from './subtitleState';
import { logger } from '@shared/logger';

export function initSubtitleRenderer(video: HTMLVideoElement, _container?: HTMLElement): void {
  setVideoElement(video);
}

export async function loadSubtitleTrack(track: SubtitleTrack): Promise<void> {
  if (!getVideoElement()) return;
  const seq = newSubtitleLoadSeq();
  removeSubtitleTrack();
  const assContent = convertToAss(track);
  if (!assContent) return;

  const fontMap = await buildFontMap(assContent, track.fonts || []);
  logger.info(
    'Subtitles',
    `loadSubtitleTrack: format=${track.format} fonts=${(track.fonts || []).length} assLen=${assContent.length} fontMapKeys=${Object.keys(fontMap).length}`
  );

  const JASSUBCtor = await ensureJASSUB();
  if (!JASSUBCtor) {
    return;
  }

  const mkvFonts = (track.fonts || []).map((f) => new Uint8Array(f.data));
  logger.info(
    'Subtitles',
    `jassub fonts: ${mkvFonts.length} items, total=${mkvFonts.reduce((s, f) => s + f.length, 0)} bytes`
  );

  if (!isSubtitleLoadCurrent(seq)) return;

  saveLastSubtitleData({
    subContent: assContent,
    fonts: track.fonts || [],
    availableFonts: fontMap
  });

  await createJassubInstance(JASSUBCtor, {
    subContent: assContent,
    fonts: mkvFonts,
    availableFonts: fontMap,
    isCurrent: () => isSubtitleLoadCurrent(seq)
  });
}

export function removeSubtitleTrack(): void {
  destroySubtitleInstance();
}

export function destroySubtitleRenderer(): void {
  destroySubtitleInstance();
  clearVideoElement();
  releaseFontBlobUrls();
}

export { getLastSubtitleData };

export async function preparePiPSubtitleData(videoPath: string): Promise<SubtitleData | null> {
  const embedded = (await window.api?.listEmbeddedSubtitles(videoPath)) ?? [];
  if (!embedded.length) return null;

  const target = embedded.find((s) => s.language === 'pol' || s.language === 'pl') || embedded[0];
  const [result, fonts] = await Promise.all([
    window.api?.extractEmbeddedSubtitle(videoPath, target.index) ?? Promise.resolve(null),
    window.api?.extractSubtitleFonts(videoPath) ?? Promise.resolve([])
  ]);
  if (!result) return null;

  const assContent = convertToAss({ format: result.format, content: result.content });
  if (!assContent) return null;

  const fontMap = await buildFontMap(assContent, fonts);

  const availableFonts: Record<string, string> = {};
  for (const [k, v] of Object.entries(fontMap)) {
    if (typeof v === 'string' && !v.startsWith('blob:')) availableFonts[k] = v;
  }
  const plainFonts: MkvFont[] = (fonts || []).map((f) => ({
    name: f.name,
    ext: f.ext || 'ttf',
    data: Array.from(f.data || [])
  }));
  return {
    subContent: assContent,
    fonts: plainFonts,
    availableFonts
  };
}
