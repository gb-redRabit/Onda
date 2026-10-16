import type { MusicbrainzRelease } from './musicbrainz';
import type {
  OpenSubtitlesDownloadParams,
  OpenSubtitlesDownloadResult,
  OpenSubtitlesSearchParams,
  OpenSubtitlesSearchResult
} from '../opensubtitles';
import type {
  NapiProjektCheckResult,
  NapiProjektDownloadParams,
  NapiProjektDownloadResult
} from '../napiprojekt';
import type {
  AnimeSubDownloadParams,
  AnimeSubDownloadResult,
  AnimeSubSearchParams,
  AnimeSubSearchResult
} from '../animesub';

// Kanały napisów (wbudowane, OpenSubtitles, NapiProjekt, AnimeSub) oraz metadanych
// MusicBrainz (wydzielone z byłego `channels-system.ts`).
export interface SubtitleChannels {
  'subtitles:listEmbedded': {
    args: [filePath: string];
    result: Array<{ index: number; language: string; title: string; codec: string }>;
  };
  'subtitles:extractEmbedded': {
    args: [filePath: string, streamIndex: number];
    result: { content: string; format: string } | null;
  };
  'subtitles:findExternal': {
    args: [videoPath: string];
    result: Array<{ name: string; path: string; format: string }>;
  };
  'subtitles:readFile': { args: [filePath: string]; result: string | null };
  'subtitles:extractAttachments': {
    args: [filePath: string];
    result: Array<{ name: string; ext: string; data: number[] }>;
  };
  'subtitles:fontCacheStats': {
    args: [];
    result: { files: number; bytes: number; videos: number };
  };
  'subtitles:fontCacheClear': {
    args: [];
    result: { removed: number; bytesFreed: number };
  };
  'opensubtitles:search': {
    args: [params: OpenSubtitlesSearchParams];
    result: OpenSubtitlesSearchResult;
  };
  'opensubtitles:download': {
    args: [params: OpenSubtitlesDownloadParams];
    result: OpenSubtitlesDownloadResult;
  };
  'napiprojekt:check': {
    args: [params: NapiProjektDownloadParams];
    result: NapiProjektCheckResult;
  };
  'napiprojekt:download': {
    args: [params: NapiProjektDownloadParams];
    result: NapiProjektDownloadResult;
  };
  'animesub:search': {
    args: [params: AnimeSubSearchParams];
    result: AnimeSubSearchResult;
  };
  'animesub:download': {
    args: [params: AnimeSubDownloadParams];
    result: AnimeSubDownloadResult;
  };
  'musicbrainz:searchRelease': {
    args: [query: string];
    result: { success: boolean; releases: MusicbrainzRelease[]; error?: string };
  };
  'musicbrainz:lookupRelease': {
    args: [releaseId: string];
    result: { success: boolean; release?: MusicbrainzRelease; error?: string };
  };
  'musicbrainz:getCoverData': {
    args: [releaseId: string];
    result: {
      success: boolean;
      data?: number[];
      mime?: string;
      error?: string;
      rateLimited?: boolean;
    };
  };
  'musicbrainz:autodetect': {
    args: [query: string];
    result: {
      success: boolean;
      match: 'certain' | 'ambiguous' | 'none';
      releases: MusicbrainzRelease[];
      error?: string;
    };
  };
}
