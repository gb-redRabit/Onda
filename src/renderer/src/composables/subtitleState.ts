import type { MkvFont } from '@renderer/types/subtitles';
import { createJassub } from '@renderer/utils/jassub';
import { logger } from '@shared/logger';

export interface SubtitleData {
  subContent: string;
  fonts: MkvFont[];
  availableFonts: Record<string, string>;
}

let JASSUBClass: typeof import('jassub').default | null = null;
let jassubInstance: InstanceType<typeof import('jassub').default> | null = null;
let videoEl: HTMLVideoElement | null = null;
let lastSubtitleData: SubtitleData | null = null;
let subtitleLoadSeq = 0;

export async function ensureJASSUB(): Promise<typeof import('jassub').default | null> {
  if (JASSUBClass) return JASSUBClass;
  try {
    const mod = await import('jassub');
    JASSUBClass = mod.default;
    return JASSUBClass;
  } catch (err) {
    logger.error('Subtitles', 'Failed to load JASSUB', err);
    return null;
  }
}

export function getVideoElement(): HTMLVideoElement | null {
  return videoEl;
}

export function setVideoElement(video: HTMLVideoElement): void {
  videoEl = video;
}

export function clearVideoElement(): void {
  videoEl = null;
}

export function newSubtitleLoadSeq(): number {
  return ++subtitleLoadSeq;
}

export function isSubtitleLoadCurrent(seq: number): boolean {
  return seq === subtitleLoadSeq;
}

export function destroySubtitleInstance(): void {
  if (jassubInstance) {
    jassubInstance.destroy();
    jassubInstance = null;
  }
}

export async function createJassubInstance(
  ctor: typeof import('jassub').default,
  opts: {
    subContent: string;
    fonts: Uint8Array[];
    availableFonts: Record<string, string>;
    isCurrent: () => boolean;
  }
): Promise<boolean> {
  if (!videoEl) return false;
  try {
    const instance = await createJassub(ctor, {
      video: videoEl,
      subContent: opts.subContent,
      fonts: opts.fonts,
      availableFonts: opts.availableFonts
    });
    if (!opts.isCurrent()) {
      instance.destroy();
      return false;
    }
    jassubInstance = instance;
    return true;
  } catch (err) {
    if (!opts.isCurrent()) return false;
    logger.error('Subtitles', 'Failed to initialize JASSUB', err);
    jassubInstance = null;
    return false;
  }
}

export function saveLastSubtitleData(data: SubtitleData): void {
  lastSubtitleData = data;
}

export function getLastSubtitleData(): SubtitleData | null {
  if (!lastSubtitleData) return null;
  const availableFonts: Record<string, string> = {};
  for (const [k, v] of Object.entries(lastSubtitleData.availableFonts)) {
    if (typeof v === 'string' && !v.startsWith('blob:')) availableFonts[k] = v;
  }
  const fonts: MkvFont[] = (lastSubtitleData.fonts || []).map((f) => ({
    name: f.name,
    ext: f.ext || 'ttf',
    data: Array.from(f.data || [])
  }));
  return {
    subContent: lastSubtitleData.subContent,
    fonts,
    availableFonts
  };
}
