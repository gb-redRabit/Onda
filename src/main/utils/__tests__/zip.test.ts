import { describe, expect, it } from 'vitest';
import { readZip } from '../zip';
import { buildZip } from './zip-builder';

describe('readZip', () => {
  it('extracts deflated and stored entries and skips directories', () => {
    const zip = buildZip([
      { name: 'a.ass', content: Buffer.from('[Script Info]\nTitle: x'), deflate: true },
      {
        name: 'b.srt',
        content: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi'),
        deflate: false
      },
      { name: 'subs/', content: Buffer.alloc(0) }
    ]);

    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['a.ass', 'b.srt']);
    expect(entries[0].data.toString('utf-8')).toBe('[Script Info]\nTitle: x');
    expect(entries[1].data.toString('utf-8')).toContain('Hi');
  });

  it('returns nothing for a non-zip buffer', () => {
    expect(readZip(Buffer.from('nie archiwum'))).toEqual([]);
    expect(readZip(Buffer.alloc(0))).toEqual([]);
  });
});
