import type { IpcDownloadConfig } from '@shared/types/ipc';

export interface DownloadProfileForm {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  audioLanguage?: string;
  coverType?: 'thumbnail' | 'none' | 'frame' | 'clip' | 'custom';
  customCoverPath?: string;
  coverFrameTime?: number;
  coverClipStart?: number;
  coverClipEnd?: number;
  coverClipFormat?: 'webm' | 'mp4';
  filenameTemplate?: string;
  artist?: string;
  album?: string;
  year?: string;
  outputDir?: string;
  subsEnabled?: boolean;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  addToLibrary?: boolean;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
}

// Maps a saved download profile config onto subscribe/download dialog form
// fields. Pure; the caller applies the patch to its refs.
export function downloadProfileToForm(c: IpcDownloadConfig): DownloadProfileForm {
  const f: DownloadProfileForm = {};
  if (c.kind) f.kind = c.kind;
  if (c.format) f.format = c.format;
  if (c.quality) f.quality = c.quality;
  if (c.audioQuality) f.audioQuality = c.audioQuality;
  if (c.audioLanguage !== undefined) f.audioLanguage = c.audioLanguage;
  if (c.cover) {
    f.coverType = c.cover.type;
    if (c.cover.type === 'custom') f.customCoverPath = c.cover.customPath || '';
    if (c.cover.type === 'frame') f.coverFrameTime = c.cover.frameTime ?? 30;
    if (c.cover.type === 'clip') {
      f.coverClipStart = c.cover.clipStart ?? 0;
      f.coverClipEnd = c.cover.clipEnd ?? 30;
      f.coverClipFormat = c.cover.clipFormat ?? 'webm';
    }
  }
  if (c.filenameTemplate) f.filenameTemplate = c.filenameTemplate;
  if (c.metaOverride) {
    f.artist = c.metaOverride.artist || '';
    f.album = c.metaOverride.album || '';
    f.year = c.metaOverride.year || '';
  }
  if (c.outputDir) f.outputDir = c.outputDir;
  if (c.subsLangs) {
    f.subsEnabled = true;
    f.subsLangs = c.subsLangs;
    f.subsFormat = c.subsFormat || 'srt';
    f.subsMode = c.subsMode || 'best';
    f.subsFolder = !!c.subsFolder;
  }
  if (c.addToLibrary !== undefined) f.addToLibrary = c.addToLibrary;
  if (c.sponsorBlock) f.sponsorBlock = c.sponsorBlock;
  if (c.trimStart != null) f.trimStart = c.trimStart;
  if (c.trimEnd != null) f.trimEnd = c.trimEnd;
  return f;
}
