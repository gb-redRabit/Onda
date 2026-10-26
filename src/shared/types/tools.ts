export const TOOL_DEFINITIONS = {
  converter: {
    route: '/tools/converter',
    title: 'Converter',
    width: 1000,
    height: 760,
    minWidth: 720,
    minHeight: 560
  },
  'video-clipper': {
    route: '/tools/video-clipper',
    title: 'Video Clipper',
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600
  },
  'video-concat': {
    route: '/tools/video-concat',
    title: 'Video Concat',
    width: 920,
    height: 720,
    minWidth: 720,
    minHeight: 520
  }
} as const;

export type ToolId = keyof typeof TOOL_DEFINITIONS;
export const TOOL_IDS = Object.keys(TOOL_DEFINITIONS) as ToolId[];

export interface ToolWindowContext {
  toolId: ToolId;
  params: Record<string, unknown>;
}

export interface ToolMessageInput {
  type: string;
  payload?: unknown;
}

export interface ToolMessage extends ToolMessageInput {
  toolId: ToolId;
}

export type ToolMediaKind = 'audio' | 'video';

export type ToolAudioFormat = 'mp3' | 'flac' | 'wav' | 'ogg' | 'opus' | 'aac' | 'm4a';
export type ToolVideoContainer = 'mp4' | 'mkv' | 'webm';
export type ToolVideoQuality = 'high' | 'medium' | 'low';

export interface MediaConvertRequest {
  jobId: string;
  kind: ToolMediaKind;
  inputPath: string;
  /** Brak = folder pliku źródłowego. */
  outputDir?: string;
  audioFormat?: ToolAudioFormat;
  /** kbps; ignorowane dla FLAC/WAV. */
  audioBitrate?: number;
  videoContainer?: ToolVideoContainer;
  videoQuality?: ToolVideoQuality;
}

export interface MediaConvertProgress {
  jobId: string;
  /** 0-100; -1 gdy nieznany czas trwania. */
  percent: number;
  timeSec?: number;
  speed?: string;
}

export type VideoClipContainer = 'mp4' | 'mkv' | 'webm';
export type VideoClipMode = 'copy' | 'exact';
export type VideoClipAudio = 'keep' | 'mute' | 'remove';
export type VideoClipRotation = 0 | 90 | 180 | 270;
export type VideoClipFormat = 'video' | 'gif';

export interface VideoClipRequest {
  jobId: string;
  inputPath: string;
  outputDir?: string;
  startSec: number;
  endSec: number;
  container: VideoClipContainer;
  mode?: VideoClipMode;
  format?: VideoClipFormat;
  audio?: VideoClipAudio;
  rotation?: VideoClipRotation;
  targetSizeMb?: number;
}

export interface VideoConcatRequest {
  jobId: string;
  inputPaths: string[];
  outputDir?: string;
  container: VideoClipContainer;
  mode?: VideoClipMode;
  audio?: VideoClipAudio;
}

export interface VideoClipThumbnailsRequest {
  inputPath: string;
  count?: number;
  startSec?: number;
  endSec?: number;
}

export interface VideoClipThumbnailsResult {
  success: boolean;
  frames?: string[];
  fps?: number;
  duration?: number;
  startSec?: number;
  stepSec?: number;
  error?: string;
}

export interface MediaConvertResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  canceled?: boolean;
}
