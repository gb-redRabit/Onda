import { describe, expect, it } from 'vitest';
import { readZip } from '../zip';
import { buildZip } from './zip-builder';

describe('readZip', () => {
  it('extracts deflated and stored entries and skips directories', async () => {
    const zip = buildZip([
      { name: 'a.ass', content: Buffer.from('[Script Info]\nTitle: x'), deflate: true },
      {
        name: 'b.srt',
        content: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi'),
        deflate: false
      },
      { name: 'subs/', content: Buffer.alloc(0) }
    ]);

    const entries = await readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['a.ass', 'b.srt']);
    expect(entries[0].data.toString('utf-8')).toBe('[Script Info]\nTitle: x');
    expect(entries[1].data.toString('utf-8')).toContain('Hi');
  });

  it('returns nothing for a non-zip buffer', async () => {
    await expect(readZip(Buffer.from('nie archiwum'))).resolves.toEqual([]);
    await expect(readZip(Buffer.alloc(0))).resolves.toEqual([]);
  });

  it('skips an entry that decompresses beyond the in-memory limit', async () => {
    // 17 MB zer kompresuje się do kilku KB — bez `maxOutputLength` byłaby to
    // klasyczna bomba ZIP blokująca proces główny.
    const zip = buildZip([
      { name: 'bomb.txt', content: Buffer.alloc(17 * 1024 * 1024), deflate: true }
    ]);
    await expect(readZip(zip)).resolves.toEqual([]);
  });

  it('skips a stored entry above the in-memory limit without inflating', async () => {
    const zip = buildZip([
      { name: 'big.txt', content: Buffer.alloc(17 * 1024 * 1024), deflate: false }
    ]);
    await expect(readZip(zip)).resolves.toEqual([]);
  });

  it('stops at a corrupt central directory signature', async () => {
    const zip = buildZip([{ name: 'a.srt', content: Buffer.from('x'), deflate: false }]);
    const eocd = zip.length - 22;
    // Offset centralnego katalogu wskazuje na lokalny nagłówek, więc sygnatura się nie zgadza.
    zip.writeUInt32LE(0, eocd + 16);

    await expect(readZip(zip)).resolves.toEqual([]);
  });

  it('skips an entry whose local header lies outside the buffer', async () => {
    const zip = buildZip([{ name: 'a.srt', content: Buffer.from('x'), deflate: false }]);
    const central = zip.readUInt32LE(zip.length - 22 + 16);
    zip.writeUInt32LE(zip.length - 4, central + 42);

    await expect(readZip(zip)).resolves.toEqual([]);
  });

  it('skips an entry whose local header signature is wrong', async () => {
    const zip = buildZip([{ name: 'a.srt', content: Buffer.from('x'), deflate: false }]);
    const central = zip.readUInt32LE(zip.length - 22 + 16);
    const local = zip.readUInt32LE(central + 42);
    zip.writeUInt32LE(0, local);

    await expect(readZip(zip)).resolves.toEqual([]);
  });
});
