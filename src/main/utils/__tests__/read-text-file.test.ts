import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readTextFileWithinBounds,
  SUBTITLE_EXTS,
  SUBTITLE_MAX_BYTES,
  TEXT_EXTS,
  TEXT_MAX_BYTES
} from '../read-text-file';

describe('readTextFileWithinBounds', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onda-readtext-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const write = (name: string, content: string): Promise<string> => {
    const p = join(dir, name);
    return writeFile(p, content, 'utf-8').then(() => p);
  };

  it('reads an allowed extension', async () => {
    const p = await write('movie.srt', '1\n00:00:01,000 --> 00:00:02,000\nhello\n');
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toContain('hello');
  });

  it('rejects a file that is not a subtitle, so the channel is not a generic read', async () => {
    // Prawdziwy wyciek: przejęty renderer wskazujący plik ciasteczek sesji
    // YouTube, który nie ma rozszerzenia napisów.
    const p = await write('youtube-cookies.txt', 'SID=secret-session-id');
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects a cookies file even when .txt is an allowed extension', async () => {
    const p = await write('youtube-cookies.txt', 'SID=secret-session-id');
    const result = await readTextFileWithinBounds(p, TEXT_EXTS, TEXT_MAX_BYTES, 'test');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects temporary yt-dlp cookie files', async () => {
    const p = await write('onda-yt-cookies-123.txt', 'SID=secret-session-id');
    const result = await readTextFileWithinBounds(p, TEXT_EXTS, TEXT_MAX_BYTES, 'test');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects non-absolute, relative and traversing paths', async () => {
    for (const bad of ['', 'relative.srt', '../escape.srt', `subdir/../x.srt`, null, 42]) {
      const result = await readTextFileWithinBounds(bad, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
      expect(result).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('rejects a directory whose name carries an allowed extension', async () => {
    const p = join(dir, 'looks.srt');
    await mkdir(p);
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects a file over the size ceiling', async () => {
    const p = join(dir, 'big.srt');
    await writeFile(p, 'x'.repeat(2048), 'utf-8');
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, 1024, 'test');
    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });

  it('re-checks the size after reading, so a concurrent growth cannot slip past', async () => {
    // `stat` i `readFile` to osobne wywołania; plik, który urośnie pomiędzy nimi,
    // nadal musi zostać odrzucony, a nie zwrócony w całości.
    const result = await readTextFileWithinBounds(
      join(dir, 'growing.srt'),
      SUBTITLE_EXTS,
      2,
      'test',
      {
        stat: async () => ({ isFile: () => true, size: 1 }),
        readFile: async () => Buffer.from('grown past the cap')
      }
    );
    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });

  it('reports a missing file as unreadable rather than throwing', async () => {
    const result = await readTextFileWithinBounds(
      join(dir, 'missing.srt'),
      SUBTITLE_EXTS,
      SUBTITLE_MAX_BYTES,
      'test'
    );
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('falls back to latin1 for a non-UTF8 subtitle instead of returning mojibake', async () => {
    const p = join(dir, 'legacy.ass');
    // 0xE9 to 'é' w latin1 i samodzielnie nieprawidłowy bajt UTF-8.
    await writeFile(p, Buffer.from([0x5b, 0xe9, 0x5d]));
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toBe('[é]');
  });

  it('decodes Windows-1250 (typical Polish subtitles) rather than latin1', async () => {
    const p = join(dir, 'polish.srt');
    // 0xB9 to 'ą' w CP1250, ale '¹' w latin1.
    await writeFile(p, Buffer.from([0x5b, 0xb9, 0x5d]));
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toBe('[ą]');
  });

  it('keeps the two callers scoped to their own extension sets', () => {
    expect(SUBTITLE_EXTS.has('.srt')).toBe(true);
    expect(SUBTITLE_EXTS.has('.txt')).toBe(false);
    expect(TEXT_EXTS.has('.txt')).toBe(true);
    expect(TEXT_EXTS.has('.srt')).toBe(false);
  });

  it('rejects a disallowed extension with a logged warning', async () => {
    const p = await write('notes.txt', 'plain');
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('checks protected and sensitive paths outside the temp folder', async () => {
    const path = process.platform === 'win32' ? 'C:\\media\\notes.srt' : '/opt/media/notes.srt';
    const result = await readTextFileWithinBounds(path, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test', {
      stat: async () => ({ isFile: () => true, size: 1 }),
      readFile: async () => Buffer.from('x')
    });

    expect(result).toEqual({ ok: true, text: 'x' });
  });

  it('falls back to latin1 when the CP1250 decoder is unavailable', async () => {
    const decode = vi.fn(() => {
      throw new Error('decoder missing');
    });
    vi.stubGlobal(
      'TextDecoder',
      class {
        decode = decode;
      }
    );
    try {
      const result = await readTextFileWithinBounds(
        join(dir, 'legacy.srt'),
        SUBTITLE_EXTS,
        SUBTITLE_MAX_BYTES,
        'test',
        {
          stat: async () => ({ isFile: () => true, size: 3 }),
          readFile: async () => Buffer.from([0x5b, 0xe9, 0x5d])
        }
      );
      expect(result).toEqual({ ok: true, text: '[é]' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to latin1 when CP1250 produces C1 control characters', async () => {
    const result = await readTextFileWithinBounds(
      join(dir, 'c1.srt'),
      SUBTITLE_EXTS,
      SUBTITLE_MAX_BYTES,
      'test',
      {
        stat: async () => ({ isFile: () => true, size: 1 }),
        readFile: async () => Buffer.from([0x81])
      }
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toBe('\u0081');
  });

  it('reports a read error as unreadable', async () => {
    const result = await readTextFileWithinBounds(
      join(dir, 'unreadable.srt'),
      SUBTITLE_EXTS,
      SUBTITLE_MAX_BYTES,
      'test',
      {
        stat: async () => ({ isFile: () => true, size: 1 }),
        readFile: async () => Promise.reject(new Error('EIO'))
      }
    );

    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });
});
