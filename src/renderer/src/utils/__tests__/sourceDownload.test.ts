import { describe, expect, it } from 'vitest';
import { buildSourceDownloadInput } from '../sourceDownload';
import type { MediaSource } from '@renderer/types/sources';

const SOURCE: MediaSource = {
  id: 'nas-source',
  name: 'Home NAS',
  baseUrl: 'http://192.168.1.10:8080',
  auth: { type: 'none' },
  endpoints: [],
  allowPrivateNetwork: true,
  createdAt: 1
};

describe('buildSourceDownloadInput', () => {
  it('carries the source identity and its explicit private-network trust to main', () => {
    const input = buildSourceDownloadInput({
      item: {
        id: 'episode-1',
        title: 'Episode 1',
        mediaUrl: 'http://192.168.1.10:8080/video.mp4',
        type: 'video'
      },
      source: SOURCE,
      baseDir: 'C:/Downloads/api',
      autoAddToLibrary: false
    });

    expect(input.source).toMatchObject({ sourceId: 'nas-source', allowPrivateNetwork: true });
  });

  it('does not grant private-network trust when it is not enabled', () => {
    const input = buildSourceDownloadInput({
      item: {
        id: 'item-1',
        title: 'Item',
        mediaUrl: 'https://cdn.example.com/item.mp4',
        type: 'file'
      },
      source: { ...SOURCE, allowPrivateNetwork: false },
      baseDir: 'C:/Downloads/api',
      autoAddToLibrary: false
    });

    expect(input.source?.allowPrivateNetwork).toBe(false);
  });

  it('carries the item API id so a finished download can be marked', () => {
    const input = buildSourceDownloadInput({
      item: {
        id: 'episode-1',
        title: 'Episode 1',
        mediaUrl: 'https://cdn.example.com/1.mp4',
        type: 'video'
      },
      source: SOURCE,
      baseDir: 'C:/Downloads/api',
      autoAddToLibrary: false
    });

    expect(input.source?.sourceItemId).toBe('episode-1');
  });

  it('omits the item API id when the mapping did not provide one', () => {
    const input = buildSourceDownloadInput({
      item: { id: '', title: 'Item', mediaUrl: 'https://cdn.example.com/2.mp4', type: 'file' },
      source: SOURCE,
      baseDir: 'C:/Downloads/api',
      autoAddToLibrary: false
    });

    expect(input.source?.sourceItemId).toBeUndefined();
  });
});

describe('buildSourceDownloadInput edge cases', () => {
  const base = {
    source: SOURCE,
    baseDir: 'C:/Downloads/api',
    autoAddToLibrary: true
  };

  it('handles items with no urls or title', () => {
    const input = buildSourceDownloadInput({ ...base, item: { id: '', type: 'audio' } as never });

    expect(input.url).toBe('');
    expect(input.title).toBe('');
    expect(input.source).toMatchObject({ mode: 'http', sourceItemId: undefined });
    expect(input.kind).toBe('audio');
  });

  it('prefers the player url and marks yt-dlp mode', () => {
    const input = buildSourceDownloadInput({
      ...base,
      item: {
        id: 'i1',
        title: 'T',
        playerUrl: 'https://embed.example/1',
        mediaUrl: 'https://cdn.example/1.mp4',
        sourceUrl: 'https://origin.example/1',
        type: 'video'
      }
    });

    expect(input.url).toBe('https://embed.example/1');
    expect(input.source).toMatchObject({ mode: 'ytdlp', fileName: undefined });
  });

  it('uses the embed source url when no media url exists', () => {
    const input = buildSourceDownloadInput({
      ...base,
      item: { id: 'i2', title: 'T', sourceUrl: 'https://origin.example/2', type: 'video' }
    });

    expect(input.source?.mode).toBe('ytdlp');
  });

  it('keeps http mode for direct audio media', () => {
    const input = buildSourceDownloadInput({
      ...base,
      item: { id: 'i3', title: 'T', mediaUrl: 'https://cdn.example/a.mp3', type: 'audio' }
    });

    expect(input.source?.mode).toBe('http');
    expect(input.kind).toBe('audio');
    expect(input.source?.fileName).toBeTruthy();
  });

  it('writes into the source folder only when enabled', () => {
    const item = {
      id: 'i4',
      title: 'T',
      mediaUrl: 'https://cdn/x.mp4',
      type: 'video' as const
    };
    const withFolder = buildSourceDownloadInput({
      ...base,
      source: { ...SOURCE, download: { folder: true } },
      item
    });
    expect(withFolder.outputDir).toBe('C:/Downloads/api/Home NAS');

    const withoutFolder = buildSourceDownloadInput({
      ...base,
      source: { ...SOURCE, download: { folder: false } },
      item
    });
    expect(withoutFolder.outputDir).toBe('C:/Downloads/api');

    const noBase = buildSourceDownloadInput({ ...base, baseDir: '', item });
    expect(noBase.outputDir).toBe('');
  });

  it('honours explicit output and library flags', () => {
    const input = buildSourceDownloadInput({
      ...base,
      addToLibrary: false,
      outputDir: 'D:/custom',
      item: { id: 'i5', title: 'T', mediaUrl: 'https://cdn/x.mp4', type: 'video' }
    });

    expect(input.outputDir).toBe('D:/custom');
    expect(input.addToLibrary).toBe(false);
  });

  it('passes API key headers for api-key auth', () => {
    const input = buildSourceDownloadInput({
      ...base,
      source: {
        ...SOURCE,
        auth: { type: 'apikey', apiKeyId: 'key-1', headerName: 'X-Api-Key' }
      },
      item: { id: 'i6', title: 'T', mediaUrl: 'https://cdn/x.mp4', type: 'video' }
    });

    expect(input.source).toMatchObject({ apiKeyId: 'key-1', headerName: 'X-Api-Key' });
  });
});
