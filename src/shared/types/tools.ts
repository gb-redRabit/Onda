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
  },
  'tag-editor': {
    route: '/tools/tag-editor',
    title: 'Tag Editor',
    width: 1100,
    height: 780,
    minWidth: 860,
    minHeight: 560
  },
  'image-studio': {
    route: '/tools/image-studio',
    title: 'Image Studio',
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 640
  },
  'batch-images': {
    route: '/tools/batch-images',
    title: 'Batch Images',
    width: 1000,
    height: 760,
    minWidth: 760,
    minHeight: 560
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

/** Maksymalna liczba plików w jednej operacji edytora tagów. */
export const TAG_EDITOR_MAX_FILES = 500;

/** Pola edytowalne w edytorze tagów (kolejność = kolejność w UI). */
export const AUDIO_TAG_FIELDS = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'genre',
  'year',
  'track',
  'disc'
] as const;
export type AudioTagField = (typeof AUDIO_TAG_FIELDS)[number];

/** Pola tagów obsługiwane przez edytor (wspólne dla odczytu i zapisu). */
export interface AudioTagFields {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  year?: string;
  track?: string;
  disc?: string;
}

export interface TagEditorFile {
  path: string;
  /** Czy format pozwala bezpiecznie zapisać tagi (MP3/FLAC/M4A/OGG/OPUS/WAV). */
  writable: boolean;
  tags: AudioTagFields;
  error?: string;
}

export interface TagEditorWriteEntry {
  path: string;
  /** Puste pole (`''`) czyści tag; brak klucza = nie zmieniaj. */
  tags: AudioTagFields;
}

export interface TagEditorWriteResult {
  path: string;
  success: boolean;
  error?: string;
}

export type ImageOutputFormat = 'png' | 'jpeg' | 'webp' | 'avif';
export const IMAGE_OUTPUT_FORMATS = ['png', 'jpeg', 'webp', 'avif'] as const;

export interface ImageStudioLoadResult {
  success: boolean;
  /** PNG data URL of the working copy (auto-oriented, capped). */
  dataUrl?: string;
  /** Working copy dimensions (used by the editor canvas). */
  width?: number;
  height?: number;
  /** Original file dimensions (informational). */
  sourceWidth?: number;
  sourceHeight?: number;
  bytes?: number;
  format?: string;
  error?: string;
}

export interface ImageStudioSaveRequest {
  /** PNG bytes rendered by the editor canvas. */
  png: number[];
  outputPath: string;
  format: ImageOutputFormat;
  quality?: number;
}

export interface ImageStudioSaveResult {
  success: boolean;
  outputPath?: string;
  bytes?: number;
  error?: string;
}

export interface ImageStudioEstimateRequest {
  png: number[];
  format: ImageOutputFormat;
  quality?: number;
}

export interface ImageStudioEstimateResult {
  success: boolean;
  bytes?: number;
  error?: string;
}

/** Maksymalna liczba obrazów w jednej operacji wsadowej. */
export const BATCH_IMAGES_MAX_FILES = 500;

export interface BatchImageRequest {
  jobId: string;
  inputPaths: string[];
  /** Brak = folder pliku źródłowego. */
  outputDir?: string;
  format: ImageOutputFormat;
  quality?: number;
  /** 0/brak = bez zmiany rozmiaru. */
  maxWidth?: number;
  maxHeight?: number;
}

export interface BatchImageProgress {
  jobId: string;
  index: number;
  total: number;
  path: string;
  status: 'processing' | 'done' | 'error';
  outputPath?: string;
  bytes?: number;
  error?: string;
}

export interface BatchImageFileResult {
  path: string;
  success: boolean;
  outputPath?: string;
  bytes?: number;
  error?: string;
}

export interface BatchImageResult {
  success: boolean;
  canceled?: boolean;
  results: BatchImageFileResult[];
  error?: string;
}
