import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SourceItem } from '../../../shared/types/sources';

// Rejestracja adresów źródeł w rejestrze generycznych strumieni: tylko odtwarzalne
// (audio/wideo) z `mediaUrl`, bez duplikatów, z górnym limitem na jedno pobranie.

vi.mock('../../media/media-server-stream-registry', () => ({
  registerGenericStreamUrl: vi.fn(async () => {})
}));

import { registerGenericStreamUrl } from '../../media/media-server-stream-registry';
import { registerPlayableMediaUrls } from '../generic-fetch';

const reg = vi.mocked(registerGenericStreamUrl);

const item = (over: Partial<SourceItem>): SourceItem =>
  ({ id: over.id ?? 'x', title: 'T', type: 'video', ...over }) as SourceItem;

describe('registerPlayableMediaUrls', () => {
  beforeEach(() => reg.mockClear());

  it('registers only unique public audio/video media urls', () => {
    registerPlayableMediaUrls([
      item({ id: 'a', type: 'audio', mediaUrl: 'https://c/a.mp3' }),
      item({ id: 'b', mediaUrl: 'https://c/b.mp4' }),
      item({ id: 'b2', mediaUrl: 'https://c/b.mp4' }), // duplikat
      item({ id: 'i', type: 'image', mediaUrl: 'https://c/i.jpg' }), // pomijany
      item({ id: 'f', type: 'file', mediaUrl: 'https://c/f.bin' }), // pomijany
      item({ id: 'n' }) // bez mediaUrl
    ]);
    expect(reg).toHaveBeenCalledTimes(2);
    expect(reg).toHaveBeenCalledWith('https://c/a.mp3');
    expect(reg).toHaveBeenCalledWith('https://c/b.mp4');
  });

  it('caps registrations per fetch to avoid a DNS burst', () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      item({ id: String(i), mediaUrl: `https://c/${i}.mp4` })
    );
    registerPlayableMediaUrls(many);
    expect(reg).toHaveBeenCalledTimes(100);
  });
});
