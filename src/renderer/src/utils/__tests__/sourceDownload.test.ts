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
