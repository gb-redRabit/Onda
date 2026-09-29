import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readTextFileWithinBounds,
  SUBTITLE_EXTS,
  SUBTITLE_MAX_BYTES,
  TEXT_EXTS
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
    // The real leak: a compromised renderer naming the YouTube session cookie
    // file, which has no subtitle extension.
    const p = await write('youtube-cookies.txt', 'SID=secret-session-id');
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
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
    // `stat` and `readFile` are separate calls; a file that grows in between
    // must still be refused rather than returned in full.
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
    // 0xE9 is 'é' in latin1 and an invalid UTF-8 byte on its own.
    await writeFile(p, Buffer.from([0x5b, 0xe9, 0x5d]));
    const result = await readTextFileWithinBounds(p, SUBTITLE_EXTS, SUBTITLE_MAX_BYTES, 'test');
    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toBe('[é]');
  });

  it('keeps the two callers scoped to their own extension sets', () => {
    expect(SUBTITLE_EXTS.has('.srt')).toBe(true);
    expect(SUBTITLE_EXTS.has('.txt')).toBe(false);
    expect(TEXT_EXTS.has('.txt')).toBe(true);
    expect(TEXT_EXTS.has('.srt')).toBe(false);
  });
});
