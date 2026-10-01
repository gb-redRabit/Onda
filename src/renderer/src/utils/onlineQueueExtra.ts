import type { CoverSpec, MetaOverride } from '@renderer/types/online';

export interface QueueConfigPayload {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  filenameTemplate?: string;
  cover?: CoverSpec;
  metaOverride?: MetaOverride;
  outputDir?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioLanguage?: string;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
}

// Buduje dodatkowy payload per zadanie z dialogu konfiguracji, uwzględniając tylko
// pola faktycznie ustawione przez użytkownika (puste wartości są pomijane).
export function buildQueueExtra(payload: QueueConfigPayload) {
  return {
    ...(payload.kind ? { kind: payload.kind } : {}),
    ...(payload.format ? { format: payload.format } : {}),
    ...(payload.quality ? { quality: payload.quality } : {}),
    ...(payload.audioQuality ? { audioQuality: payload.audioQuality } : {}),
    ...(payload.videoContainer ? { videoContainer: payload.videoContainer } : {}),
    ...(payload.filenameTemplate ? { filenameTemplate: payload.filenameTemplate } : {}),
    ...(payload.cover ? { cover: payload.cover } : {}),
    ...(payload.metaOverride ? { metaOverride: payload.metaOverride } : {}),
    ...(payload.outputDir ? { outputDir: payload.outputDir } : {}),
    ...(payload.subsLangs ? { subsLangs: payload.subsLangs } : {}),
    ...(payload.subsFormat ? { subsFormat: payload.subsFormat } : {}),
    ...(payload.subsMode ? { subsMode: payload.subsMode } : {}),
    ...(payload.subsFolder ? { subsFolder: payload.subsFolder } : {}),
    ...(payload.audioLanguage ? { audioLanguage: payload.audioLanguage } : {}),
    ...(payload.sponsorBlock && payload.sponsorBlock !== 'off'
      ? { sponsorBlock: payload.sponsorBlock }
      : {}),
    ...(payload.trimStart != null && payload.trimEnd != null
      ? { trimStart: payload.trimStart, trimEnd: payload.trimEnd }
      : {})
  };
}
