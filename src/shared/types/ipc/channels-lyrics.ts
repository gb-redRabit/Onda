import type { LyricsResult } from '../lyrics';

export interface LyricsChannels {
  'lyrics:get': {
    args: [filePath: string];
    result: LyricsResult;
  };
}
