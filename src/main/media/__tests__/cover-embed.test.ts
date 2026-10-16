import { describe, it, expect, vi } from 'vitest';
import { coverEmbedSupported, embedCover } from '../cover-embed';

// `cover-embed` importuje `binaries` → `electron`, którego nie ma w jsdom.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

// Regresja: `writeCoverToAudioFile` wołał NodeID3 bez sprawdzenia formatu i dla
// m4a/flac/opus doklejał blok ID3 na początku pliku, uszkadzając kontener.
describe('coverEmbedSupported', () => {
  it('supports ID3 (mp3) and attached_pic containers (m4a/m4b/flac)', () => {
    for (const p of ['a.mp3', 'A.MP3', 'x.m4a', 'x.m4b', 'x.flac']) {
      expect(coverEmbedSupported(p)).toBe(true);
    }
  });

  it('rejects containers where ID3 would corrupt the file', () => {
    for (const p of ['a.opus', 'a.webm', 'a.ogg', 'a.wav', 'a.aac', 'a.mp4', 'noext']) {
      expect(coverEmbedSupported(p)).toBe(false);
    }
  });
});

describe('embedCover', () => {
  it('throws for unsupported containers before touching the file', async () => {
    await expect(
      embedCover('/nonexistent/file.opus', { buffer: Buffer.from('x'), mime: 'image/jpeg' })
    ).rejects.toThrow(/unsupported/i);
  });
});
