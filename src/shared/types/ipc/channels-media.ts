// Kanały multimediów: miniatury, strumień serwera, transkodowanie (wydzielone z
// byłego `channels-system.ts`).
export interface MediaChannels {
  'media:checkAudioCodec': {
    args: [filePath: string];
    result: { codec: string; supported: boolean } | null;
  };
  'media:transcodeAudio': {
    args: [filePath: string];
    result: string | null;
  };
  'media:transcodeAudioChunk': {
    args: [filePath: string, startTime: number, duration: number];
    result: string | null;
  };
  'media:transcodeVideo': {
    args: [filePath: string];
    result: string | null;
  };
  'media:getThumbnail': {
    args: [filePath: string, maxSize?: number];
    result: string | null;
  };
  'media:batchThumbnails': {
    args: [files: string[], maxSize?: number];
    result: Record<string, string>;
  };
  'media:remoteImage': {
    args: [url: string];
    result: string | null;
  };
  'media:grantAccess': { args: [filePath: string]; result: boolean };
  'media:getServerUrl': { args: []; result: string };
}
