import type { PipSubtitleData, AudioPipLayoutOpts } from '../pip';

export type { AudioPipLayoutOpts };

export interface PipLayoutOpts {
  position?: string;
  width?: number;
  height?: number;
}

export interface PipStartSettings extends PipLayoutOpts {
  startTime?: number;
  subtitle?: PipSubtitleData | null;
}

export interface PipChannels {
  'pip:start': { args: [videoSrc: string, settings?: PipStartSettings]; result: boolean };
  'pip:stop': { args: []; result: boolean };
  /** Okno główne prosi o wciągnięcie wideo PiP z powrotem do odtwarzacza. */
  'pip:restore': { args: []; result: boolean };
  'pip:preload': { args: [videoSrc: string, subtitleData: PipSubtitleData | null]; result: void };
  'pip:loadtrack': { args: [videoSrc: string, subtitleData: PipSubtitleData | null]; result: void };
  'pip:updateSubtitle': { args: [data: PipSubtitleData | null]; result: void };
  'pip:previewStart': { args: [opts: PipLayoutOpts]; result: boolean };
  'pip:previewStop': { args: []; result: boolean };
  'pip:previewUpdate': { args: [opts: PipLayoutOpts]; result: boolean };
  'audio-pip:show': {
    args: [state: Record<string, unknown>, opts?: AudioPipLayoutOpts];
    result: boolean;
  };
  'audio-pip:hide': { args: []; result: boolean };
  'audio-pip:autoHide': { args: []; result: boolean };
  'audio-pip:prewarm': { args: []; result: boolean };
  'audio-pip:update': {
    args: [state: Record<string, unknown>, opts?: AudioPipLayoutOpts];
    result: boolean;
  };
  'audio-pip:previewStart': { args: [opts?: AudioPipLayoutOpts]; result: boolean };
  'audio-pip:previewStop': { args: []; result: boolean };
  'audio-pip:previewUpdate': { args: [opts?: AudioPipLayoutOpts]; result: boolean };
}
