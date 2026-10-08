import { describe, it, expect } from 'vitest';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import { sourceItemPlayUrl, isSourceItemPlayable, buildSourceStreamTrack } from '../sourceStream';

const source: MediaSource = {
  id: 'src',
  name: 'Source',
  baseUrl: 'https://api.example',
  auth: { type: 'none' },
  endpoints: [],
  createdAt: 0
};

const video: SourceItem = {
  id: 'v1',
  title: 'Odcinek 1',
  type: 'video',
  mediaUrl: 'https://cdn.example/ep1.mp4',
  duration: '1:02',
  thumbnail: 'https://cdn.example/1.jpg'
};

describe('sourceStream', () => {
  it('detects a direct media url', () => {
    expect(sourceItemPlayUrl(video)).toBe('https://cdn.example/ep1.mp4');
    expect(isSourceItemPlayable(video)).toBe(true);
    expect(isSourceItemPlayable({ id: 'x', title: 'X', type: 'video' })).toBe(false);
  });

  it('builds a stream track from the media url', () => {
    const track = buildSourceStreamTrack(source, video, 0);
    expect(track.id).toBe('src:src:v1');
    expect(track.name).toBe('Odcinek 1');
    expect(track.path).toBe('https://cdn.example/ep1.mp4');
    expect(track.type).toBe('stream');
    expect(track.extension).toBe('mp4');
    expect(track.mimeType).toBe('video/mp4');
    expect(track.duration).toBe(62);
    expect(track.thumbnail).toBe('https://cdn.example/1.jpg');
  });

  it('derives the audio mime type and falls back to id when untitled', () => {
    const audio = buildSourceStreamTrack(
      source,
      { id: 'a1', title: '', type: 'audio', mediaUrl: 'https://cdn.example/song.mp3' },
      3
    );
    expect(audio.name).toBe('a1');
    expect(audio.extension).toBe('mp3');
    expect(audio.mimeType).toBe('audio/mpeg');
  });
});
