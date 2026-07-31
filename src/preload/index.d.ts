import { ElectronAPI } from '@electron-toolkit/preload';

import type { IpcChannels, IpcChannel } from '@shared/types/ipc';

interface OndaAPI {
  mediaServerUrl: string;
  windowId: number;
  invoke: <C extends IpcChannel>(
    channel: C,
    ...args: IpcChannels[C]['args']
  ) => Promise<IpcChannels[C]['result']>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
  pipStart: (
    videoSrc: string,
    settings?: {
      position?: string;
      width?: number;
      height?: number;
      startTime?: number;
      subtitle?: unknown;
    }
  ) => Promise<boolean>;
  pipStop: () => Promise<boolean>;
  pipPreviewStart: (opts: {
    position?: string;
    width?: number;
    height?: number;
  }) => Promise<boolean>;
  pipPreviewStop: () => Promise<boolean>;
  pipPreviewUpdate: (opts: {
    position?: string;
    width?: number;
    height?: number;
  }) => Promise<boolean>;
  pipPreload: (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ) => Promise<void>;
  pipLoadTrack: (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ) => Promise<void>;
  checkFfmpeg: () => Promise<{ installed: boolean; version: string | null }>;
  checkFfprobe: () => Promise<{ installed: boolean; version: string | null }>;
  checkYtdlp: () => Promise<{ installed: boolean; version: string | null; path: string | null }>;
  installFfmpeg: () => Promise<{ success: boolean; error?: string }>;
  installYtdlp: () => Promise<{ success: boolean; error?: string }>;
  checkMkvextract: () => Promise<{ installed: boolean; version: string | null }>;
  installMkvextract: () => Promise<{ success: boolean; error?: string }>;
  getCover: (filePath: string) => Promise<{ type: 'video' | 'image' | null; data: string | null }>;
  getDuration: (filePath: string) => Promise<number>;
  writeTags: (
    filePath: string,
    tags: Record<string, string | undefined>
  ) => Promise<{ success: boolean; error?: string }>;
  renameFile: (
    oldPath: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string; newPath?: string }>;
  writeCover: (
    filePath: string,
    imageSource: number[] | string
  ) => Promise<{ success: boolean; error?: string }>;
  readCover: (filePath: string) => Promise<{ mime?: string; data?: number[] } | null>;
  openImageDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  musicbrainzSearchRelease: (
    query: string
  ) => Promise<{ success: boolean; releases: any[]; error?: string }>;
  musicbrainzLookupRelease: (
    releaseId: string
  ) => Promise<{ success: boolean; release?: any; error?: string }>;
  musicbrainzGetCoverData: (
    releaseId: string
  ) => Promise<{ success: boolean; data?: number[]; mime?: string; error?: string }>;
  getFilePath: (file: File) => string;
  listEmbeddedSubtitles: (
    filePath: string
  ) => Promise<Array<{ index: number; language: string; title: string; codec: string }>>;
  extractEmbeddedSubtitle: (
    filePath: string,
    streamIndex: number
  ) => Promise<{ content: string; format: string } | null>;
  findExternalSubtitles: (
    videoPath: string
  ) => Promise<Array<{ name: string; path: string; format: string }>>;
  readSubtitleFile: (filePath: string) => Promise<string | null>;
  extractSubtitleFonts: (
    filePath: string
  ) => Promise<Array<{ name: string; ext: string; data: number[] }>>;
  getPlaybackPosition: (filePath: string) => Promise<number>;
  setPlaybackPosition: (filePath: string, position: number) => Promise<void>;
  clearPlaybackPosition: (filePath: string) => Promise<void>;
  pipUpdateSubtitle: (
    data: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ) => Promise<void>;
  checkAudioCodec: (filePath: string) => Promise<{ codec: string; supported: boolean } | null>;
  transcodeAudio: (filePath: string) => Promise<string | null>;
  transcodeAudioChunk: (filePath: string, startTime: number, duration: number) => Promise<string | null>;
  cleanupTranscodedAudio: (audioPath: string) => Promise<void>;
  audioPipShow: (
    state: Record<string, unknown>,
    mode?: string,
    opacity?: number,
    position?: string
  ) => Promise<boolean>;
  audioPipHide: () => Promise<boolean>;
  audioPipUpdate: (
    state: Record<string, unknown>,
    mode?: string,
    opacity?: number,
    position?: string
  ) => Promise<boolean>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: OndaAPI;
  }
}
